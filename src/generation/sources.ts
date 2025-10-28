// file: src/generation/sources.ts
import fs from 'node:fs';
import path from 'node:path';
import { generateMarkdown } from '../llm/openai';

export type SourceItem = never; // nie używamy już struktury JSON

export async function fetchSourcesAsMarkdown(args: {
  subjectName: string;
  sectionTitle: string;
  topicTitle: string;
  topicDescription: string;
  conceptTitles: string[];
  count: number; // 5–12
}) {
  const count = Math.min(Math.max(args.count ?? 8, 5), 12);

  // Zwracamy gotową stronę w Markdown – H1 + lista punktowana.
  // Zero code fence’ów, zero metakomentarzy.
  const listTemplate = [
    `Zwróć WYŁĄCZNIE czysty Markdown bez code fence’ów i bez komentarzy. `,
    `Układ DOKŁADNIE taki:`,
    ``,
    `# Źródła do: ${args.topicTitle}`,
    ``,
    `> **Uwaga:** To jest *source material* przygotowany pod temat „${args.topicTitle}”.`,
    ``,
    `- [Tytuł 1](https://…) — *źródło • rok • autor/instytucja*.`,
    `  > krótki cytat/parafraza (1–2 zdania)`,
    `  **Dlaczego ważne:** zwięzłe wyjaśnienie (1 zdanie)`,
    ``,
    `- [Tytuł 2](https://…) — *…*.`,
    `  > …`,
    `  **Dlaczego ważne:** …`,
    ``,
    `… (łącznie ${count} pozycji)`,
    ``,
    `Wymagania jakościowe: tylko wiarygodne linki https (encyklopedie, biblioteki, uczelnie, culture.pl, PWN/PUW, Polona, repozytoria edukacyjne, krytyka literacka). `,
    `Preferuj polskie zasoby. Każda pozycja musi mieć prawdziwy link, krótki opis oraz „Dlaczego ważne”. Brak dłuższych wstępów.`
  ].join('\n');

  const prompt =
    `ZADANIE: przygotuj listę materiałów źródłowych (po polsku) w formacie Markdown, zgodnie ze ścisłym układem poniżej. ` +
    `Kontekst: Przedmiot=${args.subjectName}; Sekcja=${args.sectionTitle}; Temat=${args.topicTitle}; OpisTematu=${args.topicDescription}; ` +
    (args.conceptTitles?.length ? `Koncepty=${args.conceptTitles.join(' | ')}; ` : '') +
    listTemplate;

  const md = await generateMarkdown(prompt);
  return md.trim();
}

export function saveSourcesDebugMarkdown(topicTitle: string, markdown: string) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const debugDir = path.join('debug', 'sources');
  fs.mkdirSync(debugDir, { recursive: true });
  const mdPath = path.join(debugDir, `sources-${topicTitle.replace(/[^\w\-]+/g, '_')}-${ts}.md`);
  fs.writeFileSync(mdPath, markdown, 'utf8');
  return mdPath;
}
