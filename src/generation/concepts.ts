// file: src/generation/concepts.ts
import { generateMarkdown } from '../llm/openai';

type Ctx = {
  subjectName: string;
  sectionTitle: string;
  sectionDescription: string;
  topicTitle: string;
  topicDescription: string;
};

/**
 * BEZ JSON. Model zwraca listę tytułów (po jednym w linii), a my
 * tylko dzielimy po newline. Zero kod-fence’ów, zero numeracji.
 */
export async function proposeConceptTitles(args: {
  subjectName: string;
  sectionTitle: string;
  topicTitle: string;
  topicDescription: string;
  count: number; // 4–6 domyślnie
}) {
  const n = Math.min(Math.max(args.count ?? 5, 4), 6);

  const prompt =
    `Zwróć WYŁĄCZNIE czysty tekst bez code fence’ów: ${n} tytułów, ` +
    `po JEDNYM tytule w KAŻDEJ osobnej linii, bez numerów i punktorów. ` +
    `Każdy tytuł 4–7 słów, to kąt interpretacyjny (nie kategoria). ` +
    `Unikaj słów-parasoli typu „Motyw”, „Kontekst”, „Środki stylistyczne”. ` +
    `Kontekst: Przedmiot=${args.subjectName}; Sekcja=${args.sectionTitle}; ` +
    `Temat=${args.topicTitle}; OpisTematu=${args.topicDescription}.`;

  const out = await generateMarkdown(prompt);
  const titles = out
    .split(/\r?\n/)
    .map(s => s.replace(/^[-*\d\.\)\s]+/, '').trim())
    .filter(Boolean)
    .slice(0, n);

  if (!titles.length) throw new Error('Brak tytułów z modelu');
  return titles;
}

/**
 * Minimalny fallback (gdy LLM padnie).
 */
export function conceptMarkdownFromTitle(title: string, ctx: Ctx) {
  return [
    `# ${title}`,
    ``,
    `> **Czas nauki:** ok. 5 minut  `,
    `> **Trudność:** 2  `,
    `> **Rodzaj materiału:** Temat główny  `,
    `> **Umiejętności:** interpretacja, analiza kontekstu  `,
    `> **Powiązania:** ${ctx.topicTitle}`,
    ``,
    `### Cel nauki`,
    `1–2 zdania: co uczeń zrozumie/odkryje w ramach tematu „${ctx.topicTitle}”.`,
    ``,
    `### Treść`,
    `# ${title}`,
    `> Krótkie zdanie–lead (blockquote), które nadaje kierunek i kontekst.`,
    ``,
    `Pierwszy krótki akapit (2–4 zdania).`,
    ``,
    `Drugi krótki akapit (2–4 zdania).`,
    ``,
    `### Sonda / Źródło / Zajawka`,
    `Jedno zdanie: pytanie lub ciekawostka zamykająca wątek.`
  ].join('\n');
}

/**
 * LLM-first: model tworzy już gotowy Markdown.
 */
export async function expandConceptMarkdown(title: string, ctx: Ctx) {
  const formatRules = [
    `Zwróć WYŁĄCZNIE czysty Markdown (bez code fence’ów, bez komentarzy).`,
    `Po głównym H1 wstaw pustą linię.`,
    ``,
    `🧱 BLOK METADANYCH (ŚWIĄTYNIA STRUKTURALNA):`,
    `— musi wystąpić DOKŁADNIE JEDEN nieprzerwany blok 5 linii zaczynających się od "> **"`,
    `— kolejność: Czas nauki, Trudność, Rodzaj materiału, Umiejętności, Powiązania`,
    `— żadnych dodatkowych sekcji ani pól typu „Przedmiot”, „Sekcja”, „OpisSekcji”, „TytułH1” itp.`,
    `— zero pustych linii w środku, zero komentarzy`,
    `— po bloku metadanych jedna pusta linia i dalej "### Cel nauki"`,
    ``,
    `Sekcje w kolejności:`,
    `1) metadane (5 linii z > **…**)`,
    `2) "### Cel nauki" (1–2 zdania)`,
    `3) "### Treść"`,
    `   — natychmiast pod nim POWTÓRZ wielki H1 z tytułem (# ${title})`,
    `   — potem 1× blockquote (1–2 zdania)`,
    `   — potem 2–3 akapity (2–4 zdania) oddzielone pustą linią`,
    `   — bez list, numeracji, tabel ani kolejnych metadanych`,
    `   — w treści 2–6 pogrubień **kluczowych terminów**`,
    `4) "### Sonda / Źródło / Zajawka" (1 zdanie)`,
  ].join('\n');

  const strictTemplate = [
    `# ${title}`,
    ``,
    `> **Czas nauki:** ok. <liczba> minut  `,
    `> **Trudność:** <1–4>  `,
    `> **Rodzaj materiału:** <np. Temat główny | Związek między tematami | Ćwiczenie>  `,
    `> **Umiejętności:** <2–4 elementy CSV>  `,
    `> **Powiązania:** <lista CSV lub średniki>`,
    ``,
    `### Cel nauki`,
    `<1–2 zdania>`,
    ``,
    `### Treść`,
    `# ${title}`,
    `> <lead: 1–2 zdania>`,
    ``,
    `<akapit 1: 2–4 zdania>`,
    ``,
    `<akapit 2: 2–4 zdania>`,
    ``,
    `<opcjonalny akapit 3: 2–4 zdania>`,
    ``,
    `### Sonda / Źródło / Zajawka`,
    `<1 zdanie>`
  ].join('\n');

  const prompt =
    'Wygeneruj DOKŁADNIE 1 koncept edukacyjny (po polsku, poziom liceum). ' +
    'Styl: przejrzysty, zwięzły, klarowny, bez "ściany tekstu". ' +
    `Kontekst: Przedmiot=${ctx.subjectName}; Sekcja=${ctx.sectionTitle}; OpisSekcji=${ctx.sectionDescription}; ` +
    `Temat=${ctx.topicTitle}; OpisTematu=${ctx.topicDescription}; TytułH1="${title}".\n\n` +
    formatRules + '\n\n' +
    strictTemplate;

  let md = '';
  try {
    md = await generateMarkdown(prompt);
  } catch {
    md = conceptMarkdownFromTitle(title, ctx);
  }
  return ensureFormattedConcept(md, title);
}

/**
 * Strażnik: uzupełnia brakujące sekcje, nie zmienia treści.
 */
function ensureFormattedConcept(md: string, title: string): string {
  const src = (md || '').replace(/\r/g, '');
  const lines = src.split('\n');

  const hasTopH1 = /^#\s+/.test(lines[0] || '');
  const hasMeta = src.match(/^>\s*\*\*Czas nauki:\*\*/m);
  const hasCel = src.match(/^###\s+Cel nauki\s*$/m);
  const hasTresci = src.match(/^###\s+Treść\s*$/m);
  const hasInnerH1 = src.match(/^###\s+Treść\s*$(?:[\s\S]*?)^\#\s+/m);
  const hasSonda = src.match(/^###\s+Sonda\s*\/\s*Źródło\s*\/\s*Zajawka\s*$/m);

  let out = src;

  if (!hasTopH1) out = `# ${title}\n\n` + out;

  if (!hasMeta) {
    const inject = [
      `> **Czas nauki:** ok. 5 minut  `,
      `> **Trudność:** 2  `,
      `> **Rodzaj materiału:** Temat główny  `,
      `> **Umiejętności:** interpretacja, analiza kontekstu  `,
      `> **Powiązania:** ${title}`,
      ``
    ].join('\n');
    out = out.replace(/^#\s+.*$/m, (m) => `${m}\n\n${inject}`);
  }

  if (!hasCel) out += `\n\n### Cel nauki\n<1–2 zdania>\n`;
  if (!hasTresci) out += `\n\n### Treść\n# ${title}\n> <lead>\n\n<akapit 1>\n\n<akapit 2>\n`;
  else if (!hasInnerH1) out = out.replace(/^###\s+Treść\s*$/m, `### Treść\n# ${title}`);
  if (!hasSonda) out += `\n\n### Sonda / Źródło / Zajawka\n<1 zdanie>\n`;

  out = out.replace(/\n{3,}/g, '\n\n').trim() + '\n';
  return out;
}
