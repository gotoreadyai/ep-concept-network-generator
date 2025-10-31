// file: src/generation/handbook.ts
import fs from 'node:fs';
import path from 'node:path';
import { generateMarkdown } from '../llm/openai';

export type HandbookInput = {
  workTitle: string;
  author: string;
  targetMinutes?: number;
  desiredChapters?: number;
  outDir?: string;
};

export type HandbookResult = {
  markdownPath: string;
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}
function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** 🔎 Parser Spisu treści (—, –, - oraz opcjonalne **pogrubienie**). */
export function parseToc(md: string): Array<{ title: string; description: string }> {
  const lines = md.split('\n');
  const items: Array<{ title: string; description: string }> = [];
  let inToc = false;

  for (const raw of lines) {
    const line = raw.trim();

    if (/^##\s*Spis\s+treści\s*$/i.test(line)) {
      inToc = true;
      continue;
    }
    if (inToc) {
      if (!line) continue;
      if (/^---+$/.test(line) || /^##\s+Rozdział\s+\d+:/i.test(line) || /^##\s+Epilog/i.test(line)) break;

      const m =
        line.match(/^(?:-?\s*\d+\.\s*|\-\s*)?\*\*(.+?)\*\*\s*[—–-]\s*(.+)\s*$/) ||
        line.match(/^(?:-?\s*\d+\.\s*|\-\s*)?(.+?)\s*[—–-]\s*(.+)\s*$/);

      if (m) {
        const title = (m[1] || '').trim();
        const description = (m[2] || '').trim();
        if (title && description) items.push({ title, description });
      }
    }
  }
  return items;
}

/** 🧠 Monolit: ToC + rozdziały do jednego pliku (bez DB) */
export async function generateHandbook(input: HandbookInput): Promise<HandbookResult> {
  const targetMinutes = clamp(Math.round(input.targetMinutes ?? 5), 3, 8);
  const desiredChapters = clamp(Math.round(input.desiredChapters ?? 12), 10, 15);
  const wordsTarget = targetMinutes * 160;
  const outDir = input.outDir || path.join('debug', 'handbooks');
  ensureDir(outDir);

  const prompt = [
    `Zwróć WYŁĄCZNIE czysty Markdown (bez code fence’ów).`,
    `Wygeneruj wierny, narracyjny skrót dzieła 1:1.`,
    `Dzieło: "${input.workTitle}" — ${input.author}.`,
    `- Długość ≈ ${wordsTarget} słów.`,
    `- Struktura: 10–15 rozdziałów + "## Epilog".`,
    `- Styl: czas teraźniejszy, krótkie zdania, scenicznie.`,
    `- Wierność: bez dodawania scen, faktów ani zmian kolejności.`,
    `Format:`,
    `# ${input.workTitle} — wersja skrócona`,
    `(1 akapit opisu)`,
    `## Spis treści`,
    `- 1. **<Tytuł>** — opis`,
    `(12 pozycji)`,
    `---`,
    `## Rozdział 1: <Tytuł>`,
    `(akapit 2–6 zdań)`,
    `## Epilog`,
    `(akapit 1–3 zdania)`,
  ].join('\n');

  let markdown = (await generateMarkdown(prompt)).replace(/\r/g, '').trim();
  if (!/^\s*#\s+/.test(markdown)) markdown = `# ${input.workTitle} — wersja skrócona\n\n${markdown}`;

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const safeTitle = input.workTitle.replace(/[^\w\-]+/g, '_');
  const mdPath = path.join(outDir, `handbook-${safeTitle}-${ts}.md`);
  fs.writeFileSync(mdPath, markdown + '\n', 'utf8');

  return { markdownPath: mdPath };
}

/** 🧩 Rozdział po rozdziale → tylko PLIKI (zero DB) */
export async function appendChaptersIndividuallyFromToc(args: {
  filePath: string;
  workTitle: string;
  author: string;
  targetMinutesPerChapter?: number; // np. 0.4–0.6
  outDir?: string;
  range?: { from: number; to: number };
}): Promise<{ outDir: string; written: Array<{ index: number; title: string; path: string }> }> {
  const src = fs.readFileSync(args.filePath, 'utf8').replace(/\r/g, '');
  const toc = parseToc(src);
  if (!toc.length) throw new Error('Brak spisu treści.');

  const baseName = path.basename(args.filePath).replace(/\.md$/i, '');
  const baseOut = args.outDir || path.join(path.dirname(args.filePath), `${baseName}.chapters`);
  ensureDir(baseOut);

  const from = Math.max(1, args.range?.from ?? 1);
  const to = Math.min(toc.length, args.range?.to ?? toc.length);

  const results: Array<{ index: number; title: string; path: string }> = [];

  for (let i = from; i <= to; i++) {
    const idx = i - 1;
    const ch = toc[idx];
    const wordsTarget = clamp(Math.round((args.targetMinutesPerChapter ?? 0.5) * 160), 120, 400);

    const prompt = [
      `Zwróć WYŁĄCZNIE czysty Markdown (bez code fence’ów).`,
      `Dzieło: "${args.workTitle}" — ${args.author}`,
      `Rozdział ${i}: ${ch.title} — ${ch.description}`,
      ``,
      `Wygeneruj sekcję:`,
      `## Rozdział ${i}: ${ch.title}`,
      `(akapit 2–6 zdań, ≈ ${wordsTarget} słów)`,
      ``,
      `Styl: czas teraźniejszy, zwięźle, bez interpretacji. Bez spoilowania dalszych rozdziałów.`,
    ].join('\n');

    const md = (await generateMarkdown(prompt)).replace(/\r/g, '').trim();
    const content = /^##\s+Rozdział\s+\d+:/m.test(md) ? md : `## Rozdział ${i}: ${ch.title}\n${md}\n`;

    const safeTitle = ch.title
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[ąćęłńóśźż]/g, (c) => ({ 'ą':'a','ć':'c','ę':'e','ł':'l','ń':'n','ó':'o','ś':'s','ź':'z','ż':'z' } as any)[c] || c)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 80);

    const file = path.join(baseOut, `ch-${String(i).padStart(2, '0')}-${safeTitle}.md`);
    fs.writeFileSync(file, content + '\n', 'utf8');

    results.push({ index: i, title: ch.title, path: file });
  }

  // Epilog jako osobny plik
  const epilogPrompt = [
    `Zwróć WYŁĄCZNIE czysty Markdown (bez code fence’ów).`,
    `Dzieło: "${args.workTitle}" — ${args.author}`,
    `Wygeneruj sekcję epilogu:`,
    `## Epilog`,
    `(akapit 1–3 zdania, zwięźle, bez analizy literackiej)`,
    `Styl: czas teraźniejszy.`,
  ].join('\n');

  const epilogMd = (await generateMarkdown(epilogPrompt)).replace(/\r/g, '').trim();
  const epilog = /^##\s+Epilog/m.test(epilogMd) ? epilogMd : `## Epilog\n${epilogMd}\n`;
  const epilogPath = path.join(baseOut, `epilog.md`);
  fs.writeFileSync(epilogPath, epilog + '\n', 'utf8');

  return { outDir: baseOut, written: results };
}
