// file: src/generation/handbook/handbook.ts
import fs from 'node:fs';
import path from 'node:path';
import { generateMarkdown } from '../../llm/openai';
import { planNarrativeStructure, NarrativePlan } from './narrative_planner';
import { generateFinalStudySection, ChapterSummary, sanitizeChapterTitle } from './final_study_section';
import { discoverMilestones, ensurePlanHasMilestones, suggestChapterCount } from './milestones';

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

/** Czyści nagłówki z {#ch-XX} i usuwa duplikaty, zamienia [Scena ...] na zwykły akapit. */
function normalizeChapterMarkdown(md: string): string {
  let out = md.replace(/\r/g, '');
  out = out.replace(/^(#{1,3}\s+.*)\s*\{#ch-\d{2}\}\s*$/gmi, (_m, h) => h.trim());
  out = out.replace(/^\s*\*?\[([^[\]]+?)\]\*?\s*$/m, (_m, inside) => `${String(inside).trim()}`);
  out = out.replace(/^(#{1,3}\s+.+)\n\1\n/gm, (_m, h) => `${h}\n`);
  out = out.replace(/\n{3,}/g, '\n\n');
  return out.trim() + '\n';
}

/** Wyciąga 3–5 zdań „key events” z treści rozdziału (na potrzeby ściągi). */
function extractKeyEvents(chapterMd: string): string[] {
  let text = chapterMd
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\*\[[^\]]+\]\*/g, ' ')
    .replace(/^##.+$/gm, ' ')
    .replace(/\{#ch-\d{2}\}/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 20 && s.length < 220);
  return sentences.slice(0, 5);
}

/** ————— NOWE: esencja stylu/tonu/ducha dla generatora rozdziałów ————— */
function buildStyleEssence(plan: NarrativePlan): string {
  const axes = (plan.interpretiveAxes || []).filter(Boolean).join(' | ');
  const lines: string[] = [];
  lines.push(`STYL INSPIRACJA: ${plan.styleInspiration}`);
  lines.push(`TON: ${plan.overallTone}`);
  lines.push(`DUCH UTWORU: ${plan.spiritualCore}`);
  if (axes) lines.push(`OSIE INTERPRETACYJNE: ${axes}`);
  return lines.join('\n');
}

/** ————— ZMIANA: prompt rozdziałowy — teraz dostaje esencję stylu ————— */
function buildChapterPrompt(args: {
  workTitle: string;
  author: string;
  chIndex: number;
  chTitle: string;
  chType: string;
  pov: string;
  povCharacter?: string;
  planDescription: string;
  targetMinutesPerChapter: number;
  styleEssence: string;              // ⟵ NOWE
  narrativeVoice?: string;           // (opcjonalnie: do celów diagnostycznych)
}) {
  const minutes = clamp(Math.round(args.targetMinutesPerChapter || 5), 3, 8);
  const targetWords = clamp(minutes * 170, 500, 1400);

  return [
    `Zwróć WYŁĄCZNIE czysty Markdown (bez code fence'ów).`,
    ``,
    `Dzieło: "${args.workTitle}" — ${args.author}`,
    `Rozdział ${args.chIndex}: ${sanitizeChapterTitle(args.chTitle)}`,
    args.narrativeVoice ? `Tryb narracyjny (plan): ${args.narrativeVoice}` : ``,
    ``,
    `WYMAGANIA NARRACYJNE (KLUCZOWE):`,
    `- Zacznij od 1–2 zdań *fabularnego wprowadzenia* (kontekst miejsca/czasu/sytuacji).`,
    `- Dialogi prowadź PŁYNNIE: całe 3–4 wymiany pod rząd bez didaskaliów; gesty dawkuj rzadziej (co 2–3 kwestie), krótkie frazy.`,
    `- Unikaj poszatkowania: nie wtrącaj po każdej linijce opisu gestu.`,
    `- Sceny łącz krótkimi mostkami narracyjnymi (1–2 zdania) zamiast cięć.`,
    `- Bez kotwic {#ch-XX}. Opis typu [Scena w salonie…] NIE używaj — opisz to zdaniami fabularnymi.`,
    `- Długość: ~${targetWords} słów (±15%).`,
    ``,
    `ESENCJA STYLU / TON / DUCH (MUSI BYĆ ZACHOWANE):`,
    args.styleEssence,
    ``,
    `INSPIRACJA/PLAN (skrót akcji, nie cytuj):`,
    `- ${args.planDescription}`,
    ``,
    `POV: ${args.pov}${args.povCharacter ? ` (${args.povCharacter})` : ''}, typ: ${args.chType}.`,
    ``,
    `Struktura wyjścia:`,
    `## Rozdział ${String(args.chIndex)}: ${sanitizeChapterTitle(args.chTitle)}`,
    ``,
    `(1 akapit fabularnego wprowadzenia – proza, nie w nawiasach)`,
    ``,
    `(Dalej scena/e: dialogi + krótkie mostki narracyjne; minimum dwa fragmenty płynnego dialogu bez didaskaliów w środku)`,
  ].filter(Boolean).join('\n');
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
  out = out.replace(/^\s*\[([^[\]]+?)\]\s*$/m, (_m, inside) => `*${String(inside).trim()}*`);
  out = out.replace(/^(# .+)\n\1\n/gm, (_m, h) => `${h}\n`);
  return out.trim() + '\n';
}

export async function generateHandbook(input: HandbookInput): Promise<HandbookResult> {
  const outDir = input.outDir || path.join('debug', 'handbooks');
  ensureDir(outDir);

  // 0) Najpierw — niech model zaproponuje kamienie milowe (z cache).
  const discovered = await discoverMilestones(input.workTitle, input.author);
  const targetChapters = suggestChapterCount({
    targetMinutes: input.targetMinutes,
    milestonesCount: discovered.milestones.length || 10,
    desiredChapters: input.desiredChapters,
  });

  // 1) Plan (korzysta z docelowej liczby rozdziałów)
  console.log(`🎭 Faza 1: Planowanie struktury narracyjnej... (chapters=${targetChapters})`);
  let narrativePlan = await planNarrativeStructure(input.workTitle, input.author, targetChapters);

  // 2) Wymuś obecność kanonu (bez twardych list — korzystamy z propozycji modelu)
  narrativePlan = ensurePlanHasMilestones(narrativePlan, discovered.milestones);

  // 2.1) ————— NOWE: persist planu z esencją stylu/ducha —————
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const safeTitle = slugifyPolish(input.workTitle);
  const planPath = path.join(outDir, `handbook-${safeTitle}-${ts}.plan.json`);
  const styleEssence = buildStyleEssence(narrativePlan);
  fs.writeFileSync(planPath, JSON.stringify({
    workTitle: input.workTitle,
    author: input.author,
    narrativePlan,
    styleEssence,
  }, null, 2), 'utf8');
  console.log(`🧭 Zapisano plan narracyjny (+esencję stylu) → ${path.basename(planPath)}`);

  // 3) H1 + TOC z planu
  const prompt = [
    `Zwróć WYŁĄCZNIE czysty Markdown (bez code fence'ów).`,
    ``,
    `# ${input.workTitle} — wersja skrócona`,
    ``,
    `(1 akapit immersyjnego wprowadzenia)`,
    ``,
    `## Spis treści`,
    ...narrativePlan.chapters.map(
      (ch) => `- ${ch.index}. **${sanitizeChapterTitle(ch.title)}** — ${ch.description}`
    ),
  ].join('\n');

  const raw = await generateMarkdown(prompt);
  let markdown = unwrapCodeFence(raw);
  if (!/^\s*#\s+/.test(markdown)) markdown = `# ${input.workTitle} — wersja skrócona\n\n${markdown}`;
  const cleaned = softSanitize(markdown);

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

/**
 * NOWA wersja: GENERUJEMY PEŁNE ROZDZIAŁY ch-XX.md
 * + na końcu powstaje _SEKCJA_MATURALNA.md na bazie faktycznej treści rozdziałów.
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

  const from = args.range?.from ?? 1;
  const to = args.range?.to ?? args.narrativePlan.chapters.length;

  const written: Array<{ index: number; title: string; path: string; id: string; slug: string }> = [];

  // ——— Esencja stylu/ducha wyciągnięta z planu (persistowana też w .plan.json) ———
  const styleEssence = buildStyleEssence(args.narrativePlan);

  for (const ch of args.narrativePlan.chapters) {
    if (ch.index < from || ch.index > to) continue;

    const cleanTitle = sanitizeChapterTitle(ch.title);
    const id = `ch-${String(ch.index).padStart(2, '0')}`;
    const slug = `${id}-${slugifyPolish(cleanTitle)}`;
    const outPath = path.join(baseOut, `${slug}.md`);

    if (!args.force && fs.existsSync(outPath)) {
      const existing = normalizeChapterMarkdown(fs.readFileSync(outPath, 'utf8'));
      fs.writeFileSync(outPath, existing, 'utf8');
      console.log(`↩️  Pominąłem generację (istnieje): ${path.basename(outPath)}`);
      written.push({ index: ch.index, title: cleanTitle, path: outPath, id, slug });
      continue;
    }

    const prompt = buildChapterPrompt({
      workTitle: args.workTitle,
      author: args.author,
      chIndex: ch.index,
      chTitle: cleanTitle,
      chType: ch.type,
      pov: ch.pov,
      povCharacter: ch.povCharacter,
      planDescription: ch.description,
      targetMinutesPerChapter: args.targetMinutesPerChapter ?? 5,
      styleEssence,                       // ⟵ NOWE: twardo wstrzykujemy esencję
      narrativeVoice: args.narrativePlan.narrativeVoice,
    });

    console.log(`📝 Generuję rozdział ${ch.index}: ${cleanTitle}...`);
    const raw = await generateMarkdown(prompt);
    let md = unwrapCodeFence(String(raw));
    md = normalizeChapterMarkdown(md);

    if (!/^##\s+Rozdział\s+\d+:/m.test(md)) {
      md = `## Rozdział ${String(ch.index)}: ${cleanTitle}\n\n` + md.trim() + '\n';
    }

    fs.writeFileSync(outPath, md, 'utf8');
    console.log(`   ✅ zapisano ${path.basename(outPath)}`);

    written.push({ index: ch.index, title: cleanTitle, path: outPath, id, slug });
  }

  // === ZBUDUJ STRESS-NOTES NA PODSTAWIE FAKTYCZNYCH ROZDZIAŁÓW ===
  const chapterFiles = fs.readdirSync(baseOut).filter(f => /^ch-\d+.*\.md$/i.test(f)).sort((a,b) => {
    const na = parseInt(a.match(/^ch-(\d+)/i)?.[1] ?? '0', 10);
    const nb = parseInt(b.match(/^ch-(\d+)/i)?.[1] ?? '0', 10);
    return na - nb;
  });

  const summaries: ChapterSummary[] = chapterFiles.map((fname, i) => {
    const idx = parseInt(fname.match(/^ch-(\d+)/i)?.[1] ?? String(i+1), 10);
    const md = fs.readFileSync(path.join(baseOut, fname), 'utf8');
    const titleLine = md.split(/\r?\n/).find(l => /^##\s+Rozdział/.test(l)) || `Rozdział ${idx}`;
    const cleanTitle = titleLine.replace(/^##\s+/, '').trim();
    const kev = extractKeyEvents(md);
    return {
      index: idx,
      title: cleanTitle,
      keyEvents: kev,
      keyQuotes: kev.slice(0, 2),
    };
  });

  console.log(`\n📚 Generuję sekcję maturalną (global study-blocks) z ${summaries.length} rozdziałów...`);
  const studyBlocksWrapped = await generateFinalStudySection(args.workTitle, args.author, summaries);

  const studySectionPath = path.join(baseOut, '_SEKCJA_MATURALNA.md');
  const payload = [
    `<!-- study-blocks:start -->`,
    studyBlocksWrapped.trim(),
    `<!-- study-blocks:end -->`,
    ``,
  ].join('\n');
  fs.writeFileSync(studySectionPath, payload, 'utf8');
  console.log(`   ✅ ${path.basename(studySectionPath)} zapisany.`);

  return { outDir: baseOut, written };
}
