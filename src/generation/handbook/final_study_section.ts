// file: src/generation/handbook/final_study_section.ts
import { generateMarkdown } from '../../llm';

export type ChapterSummary = {
  index: number;
  title: string;
  keyEvents: string[]; // 2-3 kluczowe wydarzenia
  keyQuotes: string[]; // 1-2 parafrazy warte zapamiętania
};

/**
 * Zamienia "(Rozdział X)" → link HTML z kotwicą "#ch-0X".
 * Działa zachowawczo: tylko tam, gdzie jest dokładna fraza "Rozdział <liczba>" w nawiasie.
 */
function linkifyChapterRefsToHtml(mdOrHtml: string): string {
  return mdOrHtml.replace(/\(Rozdział\s+(\d{1,2})\)/g, (_m, n) => {
    const idx = Number(n);
    const id = `ch-${String(idx).padStart(2, '0')}`;
    return `<a href="#${id}">Rozdział ${idx}</a>`;
  });
}

function unwrapCodeFence(s: string) {
  const trimmed = s.replace(/\r/g, '').trim();
  const fenced = trimmed.match(/^```[a-zA-Z0-9-]*\n([\s\S]*?)\n```$/);
  if (fenced) return fenced[1].trim();
  return trimmed.replace(/^```[a-zA-Z0-9-]*\n?/, '').replace(/\n?```$/, '').trim();
}

/** Dodatkowa SANITACJA HTML dla study-blocków (po LLM). */
function sanitizeStudyHtml(html: string): string {
  let out = html;

  // 1) Usuń ewentualne fence’y i zdekoduj typowe encje (gdyby gdzieś przeszły)
  out = out.replace(/```[a-z0-9-]*\n?/gi, '').replace(/```/g, '');
  out = out.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

  // 2) Usuń puste <li> (to psuło składnię i kolorowanie)
  out = out.replace(/<li>\s*<\/li>/g, '');

  // 3) Zbędne podwójne spacje/linie w środku list
  out = out
    .replace(/(\n|\r)+\s*(<\/li>)/g, '$2')
    .replace(/<ul>\s+\n/g, '<ul>\n')
    .replace(/\n\s+<\/ul>/g, '\n</ul>');

  // 4) Upewnij się, że każdy study-block jest odseparowany pustą linią (czytelność/bezpieczny parse)
  out = out.replace(/<\/study-block>\s*(?=<study-block\b)/g, '</study-block>\n\n');

  // 5) Drobne porządki białych znaków
  out = out.replace(/[ \t]+\n/g, '\n').trim();

  return out;
}

/** Generuje CAŁĄ „Sekcję maturalną” jako zestaw SEMANTYCZNYCH BLOKÓW HTML (<study-block id="...">) */
export async function generateFinalStudySection(
  workTitle: string,
  author: string,
  chapterSummaries: ChapterSummary[]
): Promise<string> {
  const material = [
    `DZIEŁO: "${workTitle}" — ${author}`,
    `ROZDZIAŁY: ${chapterSummaries.length}`,
    ``,
    `════════════════ MATERIAŁ ŹRÓDŁOWY (streszczenia rozdziałów) ════════════════`,
    ...chapterSummaries.map(
      (ch) => [
        `Rozdział ${ch.index}: ${ch.title}`,
        `- ${ch.keyEvents.join('\n- ') || '(brak)'}`
      ].join('\n')
    ),
  ].join('\n');

  const prompt = [
    `Zwróć WYŁĄCZNIE czysty HTML (bez code fence'ów, bez <html> i <body>).`,
    `Masz wygenerować sekcję maturalną jako SEMANTYCZNE BLOKI <study-block> z unikalnymi id:`,
    `- <study-block id="study-theses" data-type="theses"> — lista tez; każda pozycja zawiera odniesienia do rozdziałów w postaci "(Rozdział X)"`,
    `- <study-block id="study-motifs" data-type="motifs"> — mapa motywów; dla każdego motywu podaj rozdziały w nawiasie "(Rozdział X, Rozdział Y)"`,
    `- <study-block id="study-characters" data-type="characters"> — postacie i relacje (krótko)`,
    `- <study-block id="study-contexts" data-type="contexts"> — 2–3 konteksty zwięźle`,
    `- <study-block id="study-questions" data-type="questions"> — 8–10 pytań i krótkich odpowiedzi (2–3 zdania)`,
    `- <study-block id="study-topscenes" data-type="topscenes"> — 10 parafraz scen z odwołaniem do rozdziałów`,
    ``,
    `W każdym study-block użyj nagłówka <h2> oraz prostego HTML (<ul>, <li>, <p>, <strong>).`,
    `Unikaj długich cytatów; zamiast tego parafrazuj. Ton: coach egzaminacyjny, zwięźle i konkretnie.`,
    ``,
    material,
    ``,
    `TERAZ WYRZUĆ TYLKO TE BLOKI <study-block> — nic poza nimi.`,
  ].join('\n');

  const raw = await generateMarkdown(prompt);
  // LLM może oddać Markdown-HTML — zdejmij ewentualne fence'y i podlinkuj rozdziały
  let cleaned = unwrapCodeFence(raw).trim();

  // Przekształć "(Rozdział X)" → <a href="#ch-0X">Rozdział X</a>
  cleaned = linkifyChapterRefsToHtml(cleaned);

  // SANITY FIX: usuń puste li, fence’y, itp.
  cleaned = sanitizeStudyHtml(cleaned);

  // Owiń całość w kontener pomagający readerowi (zachowujemy markery do łatwego parsowania)
  const wrapped = [
    '<study-section>',
    cleaned,
    '</study-section>',
    ''
  ].join('\n');

  return wrapped;
}
