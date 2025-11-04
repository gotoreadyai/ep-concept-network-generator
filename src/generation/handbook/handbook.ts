// file: src/generation/handbook/handbook.ts
import fs from 'node:fs';
import path from 'node:path';
import { generateMarkdown } from '../../llm/openai';
import { planNarrativeStructure, NarrativePlan, ChapterPlan } from './narrative_planner';
import { generateFinalStudySection, ChapterSummary, sanitizeChapterTitle } from './final_study_section';

export type HandbookInput = {
  workTitle: string;
  author: string;
  targetMinutes?: number;
  desiredChapters?: number;
  outDir?: string;
};

export type HandbookResult = {
  markdownPath: string;
  narrativePlan: NarrativePlan;
};

function clamp(n: number, a: number, b: number) { return Math.max(a, Math.min(b, n)); }
function ensureDir(dir: string) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }
function unwrapCodeFence(s: string) {
  const t = s.replace(/\r/g, '').trim();
  const m = t.match(/^```[a-zA-Z0-9-]*\n([\s\S]*?)\n```$/); if (m) return m[1].trim();
  return t.replace(/^```[a-zA-Z0-9-]*\n?/, '').replace(/\n?```$/, '').trim();
}
function slugifyPolish(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[ąćęłńóśźż]/g, (c) => ({ą:'a',ć:'c',ę:'e',ł:'l',ń:'n',ó:'o',ś:'s',ź:'z',ż:'z'} as any)[c] || c)
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0,120);
}

export function parseToc(md: string): Array<{ title: string; description: string }> {
  const lines = md.split('\n'); const items: Array<{ title: string; description: string }> = []; let inToc = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (/^##\s*Spis\s+treści\s*$/i.test(line)) { inToc = true; continue; }
    if (!inToc) continue; if (!line) continue;
    if (line.startsWith('```')) break;
    if (/^---+$/.test(line) || /^##\s+Rozdział\s+\d+:/i.test(line) || /^##\s+Epilog/i.test(line)) break;
    const m = line.match(/^(?:-?\s*\d+\.\s*|\-\s*)?\*\*(.+?)\*\*\s*[—–-]\s*(.+)\s*$/)
      || line.match(/^(?:-?\s*\d+\.\s*|\-\s*)?(.+?)\s*[—–-]\s*(.+)\s*$/);
    if (m) { const title = (m[1] || '').trim(); const description = (m[2] || '').trim(); if (title && description) items.push({ title, description }); }
  }
  return items;
}

function softSanitize(md: string) {
  let out = md.replace(/\r/g, '');
  out = out.replace(/\bPrzejścia:/g, '*Przejście:*').replace(/(^|\n)Przejście:/g, '$1*Przejście:*');
  out = out.replace(/^\s*\[([^[\]]+?)\]\s*$/m, (_m, inside) => `*[${String(inside).trim()}]*`);
  out = out.replace(/(^##[^\n]+?\n)\*([^*][^\n]*?)\*\n/, (_m, head, body) => `${head}${body}\n`);
  return out.trim() + '\n';
}

export async function generateHandbook(input: HandbookInput): Promise<HandbookResult> {
  const targetMinutes = clamp(Math.round(input.targetMinutes ?? 5), 3, 8);
  const desiredChapters = clamp(Math.round(input.desiredChapters ?? 12), 10, 15);
  const outDir = input.outDir || path.join('debug', 'handbooks');
  ensureDir(outDir);

  console.log(`🎭 Faza 1: Planowanie struktury narracyjnej...`);
  const narrativePlan = await planNarrativeStructure(input.workTitle, input.author, desiredChapters);

  const prompt = [
    `Zwróć WYŁĄCZNIE czysty Markdown (bez code fence'ów).`,
    ``,
    `# ${input.workTitle} — wersja skrócona`,
    ``,
    `(1 akapit immersyjnego wprowadzenia)`,
    ``,
    `## Spis treści`,
    ...narrativePlan.chapters.map(
      (ch) => `- ${ch.index}. **${ch.title}** — ${ch.description}`
    ),
  ].join('\n');

  const raw = await generateMarkdown(prompt);
  let markdown = unwrapCodeFence(raw);
  if (!/^\s*#\s+/.test(markdown)) markdown = `# ${input.workTitle} — wersja skrócona\n\n${markdown}`;
  const cleaned = softSanitize(markdown);

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const safeTitle = slugifyPolish(input.workTitle);
  const mdPath = path.join(outDir, `handbook-${safeTitle}-${ts}.md`);
  fs.writeFileSync(mdPath, cleaned + '\n', 'utf8');

  return { markdownPath: mdPath, narrativePlan };
}

export type AppendOpts = {
  force?: boolean;
  range?: { from: number; to: number };
  outDir?: string;
  narrativePlan?: NarrativePlan;
};

/** Proste wydobycie „key events” do globalnej sekcji (bez HTML, bez paneli) */
function extractKeyEvents(chapterMd: string): string[] {
  let text = chapterMd
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\*\[[^\]]+\]\*/g, ' ')
    .replace(/^##.+$/gm, ' ')
    .replace(/\{#ch-\d{2}\}/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 20 && s.length < 200);
  return sentences.slice(0, 5);
}

/**
 * NOWA wersja: nie generujemy ŻADNYCH „per-chapter” bloków.
 * Tworzymy tylko _SEKCJA_MATURALNA.md (global study-blocks).
 */
export async function appendChaptersIndividuallyFromToc(args: {
  filePath: string;
  workTitle: string;
  author: string;
  targetMinutesPerChapter?: number;
  narrativePlan: NarrativePlan;
} & AppendOpts): Promise<{
  outDir: string;
  written: Array<{ index: number; title: string; path: string; id: string; slug: string }>;
}> {
  const baseName = path.basename(args.filePath).replace(/\.md$/i, '');
  const baseOut = args.outDir || path.join(path.dirname(args.filePath), `${baseName}.chapters`);
  ensureDir(baseOut);

  // NIE PISZEMY rozdziałów – bierzemy tylko plan do zbudowania ChapterSummary „na sucho”
  const results: Array<{ index: number; title: string; path: string; id: string; slug: string }> = [];
  const chapterSummaries: ChapterSummary[] = [];

  for (const ch of args.narrativePlan.chapters) {
    const cleanTitle = sanitizeChapterTitle(ch.title);
    const id = `ch-${String(ch.index).padStart(2, '0')}`;
    const slug = `${id}`;
    // „keyEvents” z opisu planu (wystarczy do globalnej sekcji)
    const kev = extractKeyEvents(`${ch.description}.`);
    chapterSummaries.push({
      index: ch.index,
      title: cleanTitle,
      keyEvents: kev,
      keyQuotes: kev.slice(0, 2),
    });
    // nie tworzymy plików rozdziałów:
    results.push({ index: ch.index, title: cleanTitle, path: '', id, slug });
  }

  console.log(`\n📚 Generuję WYŁĄCZNIE sekcję maturalną (global study-blocks)...`);
  const studyBlocksWrapped = await generateFinalStudySection(args.workTitle, args.author, chapterSummaries);

  const studyIndex = {
    chapters: results.map((r) => ({ index: r.index, id: r.id, slug: r.slug, title: r.title })),
    axes: [] as string[],
  };
  const studyIndexComment = `<!-- study-index: ${JSON.stringify(studyIndex)} -->`;

  // Zapisz osobny plik dla DB
  const studySectionPath = path.join(baseOut, '_SEKCJA_MATURALNA.md');
  const payload = [
    `<!-- study-blocks:start -->`,
    studyBlocksWrapped.trim(),
    `<!-- study-blocks:end -->`,
    `\n${studyIndexComment}\n`,
  ].join('\n');
  fs.writeFileSync(studySectionPath, payload, 'utf8');
  console.log(`   ✅ ${path.basename(studySectionPath)} zapisany.`);

  // ⛔️ NIC nie dopisujemy do pliku bazowego handbooka

  return { outDir: baseOut, written: results };
}
