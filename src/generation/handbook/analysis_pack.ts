// file: src/generation/analysis_pack.ts
import fs from 'node:fs';
import path from 'node:path';
import { generateMarkdown } from '../../llm/openai';

export type AnalysisPackInput = {
  workTitle: string;
  author: string;
  toc: Array<{ index: number; title: string; description?: string }>;
  chaptersDir: string; // ścieżka do katalogu z ch-XX-*.md
  outDir?: string;     // gdzie zapisać plik zbiorczy
};

function unwrapCodeFence(s: string) {
  const trimmed = s.replace(/\r/g, '').trim();
  const fenced = trimmed.match(/^```[a-zA-Z0-9-]*\n([\s\S]*?)\n```$/);
  if (fenced) return fenced[1].trim();
  return trimmed.replace(/^```[a-zA-Z0-9-]*\n?/, '').replace(/\n?```$/, '').trim();
}

export async function generateAnalysisPack(input: AnalysisPackInput): Promise<string> {
  const chapters: Array<{ index: number; title: string; md: string }> = [];
  for (const item of input.toc) {
    const num = String(item.index).padStart(2, '0');
    const file = fs.readdirSync(input.chaptersDir).find(f => f.startsWith(`ch-${num}-`) && f.endsWith('.md'));
    if (!file) continue;
    const md = fs.readFileSync(path.join(input.chaptersDir, file), 'utf8');
    chapters.push({ index: item.index, title: item.title, md });
  }

  const prompt = [
    `Zwróć WYŁĄCZNIE czysty Markdown.`,
    `Dzieło: "${input.workTitle}" — ${input.author}`,
    `DANE: spis treści + sceny rozdziałów (poniżej).`,

    ``,
    `WYNIK (format):`,
    `# ${input.workTitle} — pakiet maturalny`,
    `## 3 tezy główne`,
    `- Teza A: … (+2 argumenty: scena z tej książki + inna lektura obowiązkowa)`,
    `- Teza B: …`,
    `- Teza C: …`,

    ``,
    `## Motywy (mapa)`,
    `- Motyw X: rozdziały … (po 1 zdaniu uzasadnienia)`,
    `- …`,

    ``,
    `## Postacie i relacje`,
    `- Bohater: funkcja → …; relacje: … (po 1–2 punkty)`,

    ``,
    `## Konteksty (2–3)`,
    `- Historyczno-społeczny: …`,
    `- Filozoficzny / kulturowy: …`,

    ``,
    `## Mini-bank pytań (8–10)`,
    `- P: … → Szkielet odpowiedzi (3–4 punkty)`,

    ``,
    `MATERIAŁ ŹRÓDŁOWY (ToC + sceny):`,
    ...chapters.map(ch => `### Rozdział ${ch.index}: ${ch.title}\n${ch.md}\n`),
  ].join('\n');

  const raw = await generateMarkdown(prompt);
  const md = unwrapCodeFence(raw);

  const outDir = input.outDir || path.dirname(input.chaptersDir);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const safe = input.workTitle.replace(/[^\w\-]+/g, '_');
  const outPath = path.join(outDir, `handbook-${safe}-${ts}.analysis.md`);
  fs.writeFileSync(outPath, md + '\n', 'utf8');
  return outPath;
}
