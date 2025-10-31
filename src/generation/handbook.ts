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

/** 🔎 Parser spisu treści: zbiera {title, description} z sekcji "## Spis treści". */
export function parseToc(md: string): Array<{ title: string; description: string }> {
  const lines = md.split('\n');
  const items: Array<{ title: string; description: string }> = [];
  let inToc = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (/^##\s*Spis\s+treści\s*$/i.test(line)) { inToc = true; continue; }
    if (!inToc) continue;
    if (!line) continue;
    if (/^---+$/.test(line) || /^##\s+Rozdział\s+\d+:/i.test(line) || /^##\s+Epilog/i.test(line)) break;

    // np. "- 1. **Tytuł** — opis" | "- **Tytuł** – opis" | "1. Tytuł - opis"
    const m =
      line.match(/^(?:-?\s*\d+\.\s*|\-\s*)?\*\*(.+?)\*\*\s*[—–-]\s*(.+)\s*$/) ||
      line.match(/^(?:-?\s*\d+\.\s*|\-\s*)?(.+?)\s*[—–-]\s*(.+)\s*$/);
    if (m) {
      const title = (m[1] || '').trim();
      const description = (m[2] || '').trim();
      if (title && description) items.push({ title, description });
    }
  }
  return items;
}

/** Monolit: ToC + rozdziały do jednego pliku (bez DB). */
export async function generateHandbook(input: HandbookInput): Promise<HandbookResult> {
  const targetMinutes = clamp(Math.round(input.targetMinutes ?? 5), 3, 8);
  const desiredChapters = clamp(Math.round(input.desiredChapters ?? 12), 10, 15);
  const wordsTarget = targetMinutes * 160;
  const outDir = input.outDir || path.join('debug', 'handbooks');
  ensureDir(outDir);

  const prompt = [
    `Zwróć WYŁĄCZNIE czysty Markdown (bez code fence’ów).`,
    `Tworzysz narracyjny skrót dzieła w duchu METODY ODKRYWCZEJ.`,
    `Dzieło: "${input.workTitle}" — ${input.author}.`,
    ``,
    `ZASADY TWORZENIA:`,
    `- Czas teraźniejszy; perspektywa bliska (kamera „na ramieniu”).`,
    `- SCENA zamiast streszczenia; światło/dźwięk/ruch/gest/pauzy.`,
    `- Dialogi OBOWIĄZKOWE (min. 2 kwestie/rozdział; każda kwestia w osobnej linii z „– ”).`,
    `- SHOW, DON'T TELL. ZERO analiz/ocen/interpretacji.`,
    `- Realizm odkrywczy: wyłącznie fakty i świat oryginału; nic nie dopisuj.`,
    `- Rytm: krótkie zdania w napięciu, dłuższe w refleksji; brak ściany tekstu.`,
    ``,
    `ORIENTACJA & PRZEJŚCIA (RPG vibe):`,
    `- Każdy rozdział otwieraj linią *Orientacja* (Miejsce; Czas; Kto), np.:`,
    `  *[Pokój na poddaszu; świt; Raskolnikow]*`,
    `- Każdy rozdział kończ 1 zdaniem *Przejścia* zapowiadającym kolejny tytuł (bez spoilerów).`,
    ``,
    `FORMAT WYJŚCIOWY:`,
    `# ${input.workTitle} — wersja skrócona`,
    `(1 akapit immersyjnego opisu świata/tematu — teraźniejszy, bez analizy)`,
    `## Spis treści`,
    `- 1. **<Tytuł>** — SCENA: [miejsce; pora; bohaterowie]; AKCJA: <co się dzieje>; DIALOG: >=2; CEL: <jaki efekt sceny>; PRZEJŚCIE: <krótka zapowiedź następnego>`,
    `(... razem ${desiredChapters} pozycji; opis ma być TECHNICZNĄ INSTRUKCJĄ dla modelu, bez stylizacji literackiej)`,
    `---`,
    `## Rozdział 1: <Tytuł>`,
    `*[Miejsce; pora; kto]*`,
    `(2–3 krótkie akapity; dialogi w osobnych liniach; łącznie 2–6 zdań)`,
    `## Rozdział 2: <Tytuł>`,
    `(...)`,
    `## Epilog`,
    `(1–3 zdania; diegetycznie, bez metakomentarzy; teraźniejszy)`,
    `- Zakaz: komentarzy o stylu/prawach/politykach; brak czasu przeszłego w narracji.`,
  ].join('\n');

  let markdown = (await generateMarkdown(prompt)).replace(/\r/g, '').trim();
  if (!/^\s*#\s+/.test(markdown)) markdown = `# ${input.workTitle} — wersja skrócona\n\n${markdown}`;

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const safeTitle = input.workTitle.replace(/[^\w\-]+/g, '_');
  const mdPath = path.join(outDir, `handbook-${safeTitle}-${ts}.md`);
  fs.writeFileSync(mdPath, markdown + '\n', 'utf8');

  return { markdownPath: mdPath };
}

/** Rozdział po rozdziale → tylko pliki (content powstaje tutaj, nie w DB). */
export async function appendChaptersIndividuallyFromToc(args: {
  filePath: string;
  workTitle: string;
  author: string;
  targetMinutesPerChapter?: number;
  outDir?: string;
  range?: { from: number; to: number };
}): Promise<{ outDir: string; written: Array<{ index: number; title: string; path: string }> }> {
  const src = fs.readFileSync(args.filePath, 'utf8').replace(/\r/g, '');
  const toc = parseToc(src);
  if (!toc.length) throw new Error('Brak spisu treści.');

  const baseName = path.basename(args.filePath).replace(/\.md$/i, '');
  const baseOut = args.outDir || path.join(path.dirname(args.filePath), `${baseName}.chapters`);
  ensureDir(baseOut);

  const clampWords = (m: number) => clamp(Math.round(m * 160), 120, 400);
  const wordsTarget = clampWords(args.targetMinutesPerChapter ?? 0.5);

  const results: Array<{ index: number; title: string; path: string }> = [];
  const from = Math.max(1, args.range?.from ?? 1);
  const to = Math.min(toc.length, args.range?.to ?? toc.length);

  for (let i = from; i <= to; i++) {
    const ch = toc[i - 1];
    const next = i < toc.length ? toc[i] : null;
    const nextTitle = next ? next.title : '';
    const prompt = [
      `Zwróć WYŁĄCZNIE czysty Markdown (bez code fence’ów).`,
      `Dzieło: "${args.workTitle}" — ${args.author}`,
      `Rozdział ${i}: ${ch.title} — ${ch.description}`,
      nextTitle ? `Następny rozdział: "${nextTitle}". Zakończ scenę *Przejściem* do tego tytułu (bez spoilerów).` : `To ostatni rozdział przed epilogiem: zamknij scenę bez zapowiedzi.`,
      ``,
      `Wygeneruj JEDNĄ SCENĘ w duchu METODY ODKRYWCZEJ:`,
      `## Rozdział ${i}: ${ch.title}`,
      `*[Miejsce; pora; kto]*`,
      `(2–3 krótkie akapity, ≈ ${wordsTarget} słów; pełna immersja; czas teraźniejszy)`,
      ``,
      `ZASADY:`,
      `- SHOW, DON'T TELL.`,
      `- Minimum 2 kwestie dialogowe („– …”), każda w osobnej linii.`,
      `- Jedna ciągłość przyczynowo-skutkowa, bez teleportacji.`,
      `- Realizm odkrywczy: tylko świat i fakty z oryginału; nic nie dopisuj.`,
      `- Każdy szczegół znaczący (gest, spojrzenie, cisza).`,
      `- RPG vibe: orientacja na początku; na końcu 1 zdanie *Przejścia* (jeśli nextTitle istnieje).`,
      `- Zero metakomentarzy, zero mówienia o „stylu autora”, brak narracji z zewnątrz.`,
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

  // Epilog
  const epilogPrompt = [
    `Zwróć WYŁĄCZNIE czysty Markdown (bez code fence’ów).`,
    `Dzieło: "${args.workTitle}" — ${args.author}`,
    `## Epilog`,
    `(1–3 zdania; diegetycznie; czas teraźniejszy; zero metakomentarzy i uwag o stylu).`,
    `Ton: cichy, refleksyjny; domknięcie bez tłumaczenia sensu.`,
  ].join('\n');

  const epilogMd = (await generateMarkdown(epilogPrompt)).replace(/\r/g, '').trim();
  const epilog = /^##\s+Epilog/m.test(epilogMd) ? epilogMd : `## Epilog\n${epilogMd}\n`;
  fs.writeFileSync(path.join(baseOut, `epilog.md`), epilog + '\n');

  return { outDir: baseOut, written: results };
}
