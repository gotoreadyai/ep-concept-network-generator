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
  // Zero code fence’ów, zero metakomentarzy, ZERO pytań.
  const listTemplate = [
    `Zwróć WYŁĄCZNIE czysty Markdown bez code fence’ów i bez komentarzy. `,
    `NIE zadawaj pytań i NIE proś o potwierdzenie. Przyjmij następujące domyślne decyzje:`,
    `- Preferuj polskie, wiarygodne źródła; jeśli brakuje — dopuść solidne zasoby międzynarodowe (.edu, .gov, biblioteki, muzea, archiwa).`,
    `- Zawsze zwróć DOKŁADNIE ${count} pozycji.`,
    ``,
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
    `… (łącznie DOKŁADNIE ${count} pozycji)`,
    ``,
    `Wymagania jakościowe: tylko wiarygodne linki https (encyklopedie, biblioteki, uczelnie, culture.pl, PWN/PUW, Polona, repozytoria edukacyjne, krytyka literacka). `,
    `Preferuj polskie zasoby. Każda pozycja musi mieć prawdziwy link, krótki opis oraz „Dlaczego ważne”. Brak wstępów i podsumowań.`,
  ].join('\n');

  const promptBase =
    `ZADANIE: przygotuj listę materiałów źródłowych (po polsku) w formacie Markdown, zgodnie ze ścisłym układem poniżej. ` +
    `Kontekst: Przedmiot=${args.subjectName}; Sekcja=${args.sectionTitle}; Temat=${args.topicTitle}; OpisTematu=${args.topicDescription}; ` +
    (args.conceptTitles?.length ? `Koncepty=${args.conceptTitles.join(' | ')}; ` : '') +
    listTemplate;

  // pierwsza próba
  let md = await generateMarkdown(promptBase);

  // strażnik: jeśli model jednak poprosi o potwierdzenia/pytania → druga próba z twardszym zakazem
  const asksForConfirmation = /potwierdź|potwierdz|czy mam|po potwierdzeniu|czy chcesz/i.test(md);
  if (asksForConfirmation) {
    const promptHardened =
      `BEZ PYTAŃ I BEZ PROŚBY O POTWIERDZENIE. Zwróć dokładnie ${count} pozycji. Zacznij od linii z H1.` +
      `\n\n` + promptBase;
    md = await generateMarkdown(promptHardened);
  }

  md = md.trim();

  // drobna higiena: upewnij się, że zaczynamy H1; jeśli nie, dodaj
  if (!/^#\s+/.test(md)) {
    md = `# Źródła do: ${args.topicTitle}\n\n` + md;
  }

  // opcjonalne przycięcie do count pozycji, jeśli model przeszarżował
  // (proste heurystyczne cięcie po wierszach rozpoczynających się od "- [")
  const lines = md.split('\n');
  const itemIdx: number[] = [];
  for (let i = 0; i < lines.length; i++) if (/^\-\s*\[/.test(lines[i])) itemIdx.push(i);
  if (itemIdx.length > count) {
    const keepSet = new Set(itemIdx.slice(0, count));
    const pruned: string[] = [];
    let currentItem = -1, keptForThisItem = false, itemsKept = 0;
    for (let i = 0; i < lines.length; i++) {
      if (/^\-\s*\[/.test(lines[i])) { currentItem = i; keptForThisItem = keepSet.has(i); if (keptForThisItem) itemsKept++; }
      if (currentItem === -1 || keptForThisItem) pruned.push(lines[i]);
      // po zachowaniu dokładnie count pozycji usuń resztę listy
      if (itemsKept === count && i > currentItem && /^\s*$/.test(lines[i])) {
        // od tej pustej linii w dół zostawiamy tylko nie-listowe rzeczy
        const tail = lines.slice(i + 1).filter(l => !/^\-\s*\[/.test(l));
        md = pruned.join('\n') + (tail.length ? `\n${tail.join('\n')}` : '');
        break;
      }
    }
  }

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
