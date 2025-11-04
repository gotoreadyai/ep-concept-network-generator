

// file: src/generation/handbook/final_study_section.ts
import { generateMarkdown } from '../../llm';
import { renderStudySection, StudyBlock, LinkStrategy } from './templates/study_section_template';

export type ChapterSummary = {
  index: number;
  title: string;
  keyEvents: string[];
  keyQuotes: string[];
};

// eksportujemy, bo handbook.ts tego używa
export function sanitizeChapterTitle(raw: string): string {
  return String(raw)
    .replace(/\s*\{#ch-\d{2}\}\s*$/i, '') // zdejmij {#ch-XX}
    .replace(/<[^>]+>/g, '')             // html -> out
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parsuje tylko "-" i "*" jako wypunktowania. */
function parseBullets(md: string): string[] {
  return md
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => /^[-*]\s+.+/.test(l))
    .map(l => l.replace(/^[-*]\s+/, '').trim());
}

/** Buduje 6 bloków sekcji maturalnej i renderuje HTML przez szablon. */
export async function generateFinalStudySection(
  workTitle: string,
  author: string,
  chapterSummaries: ChapterSummary[],
  linkStrategy: LinkStrategy = { mode: 'hash' } // domyślnie włączone #ch-XX
): Promise<string> {
  const prompt = [
    'Zwróć WYŁĄCZNIE czysty Markdown (bez code fence’ów).',
    'Przygotuj 6 sekcji: "Tezy i problemy", "Motywy i symbole", "Postacie (charakterystyka)", "Kontekst historyczno-kulturowy", "Pytania egzaminacyjne / analizacyjne", "Sceny kluczowe (top scenes)".',
    'Każda sekcja: nagłówek "## ..." i 5–8 wypunktowań ("- ...").',
    'Nie używaj HTML. Odnośniki do rozdziałów pisz jako "(Rozdział X)" lub "(Rozdział X, Y)" lub "(Rozdział X–Y)".',
    '',
    `Dzieło: "${workTitle}" — ${author}.`,
    `Materiał do inspiracji (skrót zdarzeń):`,
    ...chapterSummaries.map(s => `- [${String(s.index).padStart(2,'0')}] ${sanitizeChapterTitle(s.title)} — ${s.keyEvents.slice(0,2).join('; ')}`),
  ].join('\n');

  console.log('🧠 [final_study_section] PROMPT →\n', prompt, '\n');

  const mdRaw = await generateMarkdown(prompt);
  const md = String(mdRaw).replace(/\r/g, '');
  console.log('🧠 [final_study_section] MODEL→MARKDOWN (raw) →\n', md, '\n');

  const parts = md.split(/^##\s+/m).map(s => s.trim()).filter(Boolean);
  const targetMap: Array<{ test: RegExp; id: string; title: string }> = [
    { test: /^Tezy/i,        id: 'study-theses',     title: 'Tezy i problemy' },
    { test: /^Motywy/i,      id: 'study-motifs',     title: 'Motywy i symbole' },
    { test: /^Postacie/i,    id: 'study-characters', title: 'Postacie (charakterystyka)' },
    { test: /^Kontekst/i,    id: 'study-contexts',   title: 'Kontekst historyczno-kulturowy' },
    { test: /^Pytania/i,     id: 'study-questions',  title: 'Pytania egzaminacyjne / analizacyjne' },
    { test: /^Sceny/i,       id: 'study-topscenes',  title: 'Sceny kluczowe (top scenes)' },
  ];

  const collected = new Map<string, string[]>();

  for (const part of parts) {
    const [head, ...rest] = part.split('\n');
    const body = rest.join('\n');
    const bullets = parseBullets(body);
    const spec = targetMap.find(t => t.test.test(head));
    if (spec) {
      collected.set(spec.id, bullets);
      console.log(`🔎 [final_study_section] Sekcja: "${head}" → bullets=${bullets.length}`);
    } else {
      console.log(`ℹ️  [final_study_section] Pominięto nagłówek: ${head}`);
    }
  }

  const blocks: StudyBlock[] = targetMap.map(({ id, title }) => ({ id, title, items: collected.get(id) || [] }));

  for (const b of blocks) {
    if (b.items.length < 5 || b.items.length > 8) {
      console.warn(`⚠️  [final_study_section] Sekcja ${b.id} ma ${b.items.length} punktów (oczekiwane 5–8). Kontynuuję.`);
    }
  }

  return renderStudySection(blocks, linkStrategy);
}
