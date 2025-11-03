// file: src/generation/concepts.ts
import { generateMarkdown } from '../llm';

type Ctx = {
  subjectName: string;
  sectionTitle: string;
  sectionDescription: string;
  topicTitle: string;
  topicDescription: string;
};

/* ============================ TYTUŁY ============================ */
export async function proposeConceptTitles(args: {
  subjectName: string;
  sectionTitle: string;
  topicTitle: string;
  topicDescription: string;
  count: number;
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

/* ======================= WARIANTY TREŚCI ======================= */
type Variant = {
  name: string;
  styleHint: string;
  leadAtEnd?: boolean;
  italicFrag?: boolean;
  boldMini?: boolean;
  extraPull?: boolean;
};

const VARIANTS: Variant[] = [
  { name: 'classic',  styleHint: 'Klarowny, akademicki; żywy język; 2–4 **pojęcia** wytłuszczone.' },
  { name: 'dialogue', styleHint: 'Dialogowe napięcie; 1 pytanie na akapit max.', italicFrag: true },
  { name: 'case',     styleHint: 'Studium przypadku: przykład → reguła → ograniczenia.', boldMini: true },
  { name: 'contrast', styleHint: 'Dwie perspektywy; na końcu krótka synteza.', extraPull: true },
  { name: 'magazine', styleHint: 'Metafora/obraz; zwięzłe zdania; rytm.', boldMini: true, italicFrag: true },
  { name: 'closing',  styleHint: 'Lead-konkluzja na końcu dla „efektu domknięcia”.', leadAtEnd: true, italicFrag: true },
];

function hash32(s: string): number {
  let h = 2166136261 >>> 0; // FNV-1a
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function pickVariant(title: string): Variant { return VARIANTS[ hash32(title) % VARIANTS.length ]; }

function deriveKeywords(ctx: Ctx): string[] {
  const src = `${ctx.subjectName} ${ctx.sectionTitle} ${ctx.topicTitle} ${ctx.topicDescription}`.toLowerCase();
  const stop = new Set(['oraz','ale','czy','dla','przez','jest','są','to','ten','ta','te','nad','pod','jako','mamy','więc','temat','sekcja','przedmiot','opis','kontekst','treść','cel','dlaczego','ważne']);
  const words = (src.match(/[a-ząćęłńóśźż]{4,}/g) || []).filter(w => !stop.has(w));
  const uniq: string[] = [];
  for (const w of words) if (!uniq.includes(w)) uniq.push(w);
  return uniq.slice(0, Math.min(5, Math.max(3, Math.floor(uniq.length / 3) || 3)));
}

/* ============================ FALLBACK ============================ */
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

/* ================== EKSPORT NAZWY WARIANTU DO TAGA ================== */
export function getConceptVariantName(title: string): string {
  return pickVariant(title).name;
}

/* =================== GENERACJA + STRAŻNIK FORMATU =================== */
export async function expandConceptMarkdown(title: string, ctx: Ctx) {
  const v = pickVariant(title);

  // LOG wariantu (konsola)
  // np. [variant] 🎨 "Tytuł" → magazine (boldMini, italicFrag)
  // Uwaga: nie usuwaj — pomaga diagnozować wrażenie „wszędzie ten sam wariant”.
  // eslint-disable-next-line no-console
  console.log(
    `[variant] 🎨 "${title}" → ${v.name} ` +
    `(${Object.entries(v).filter(([k,val]) => k!=='name' && val).map(([k]) => k).join(', ') || 'default'})`
  );

  const domain = deriveKeywords(ctx);
  const avoid = ['W niniejszym tekście','Na wstępie warto','Podsumowując','Reasumując','Zatem można powiedzieć','Należy zaznaczyć','Warto zauważyć'];

  const formatRules =
`Zwróć WYŁĄCZNIE czysty Markdown (bez code fence’ów, bez komentarzy).
Po głównym H1 wstaw NATYCHMIAST BLOK METADANYCH (dokładnie 5 linii, każda zaczyna się od "> **"):
> **Czas nauki:** …  
> **Trudność:** …  
> **Rodzaj materiału:** …  
> **Umiejętności:** …  
> **Powiązania:** …

Po metadanych jedna pusta linia i dalej "### Cel nauki".
Sekcje w kolejności:
1) metadane (5 linii)
2) "### Cel nauki" (1–2 zdania)
3) "### Treść"
   — NATYCHMIAST pod nim POWTÓRZ wielki H1 z tytułem (# ${title})
   — potem 1× blockquote (lead 1–2 zdania)
   — potem 2–3 akapity (2–4 zdania) oddzielone pustą linią
   — bez list, numeracji, tabel ani kolejnych metadanych
   — w treści 2–6 pogrubień **kluczowych terminów**
   — dodatkowe elementy zależne od wariantu (kursywa/mini-nagłówek/pull-quote) są dozwolone
4) "### Sonda / Źródło / Zajawka" (1 zdanie)`;

  const variantHints = [
    `Wariant: ${v.name}. ${v.styleHint}`,
    v.boldMini   ? `Dodaj po leadzie krótki mini-nagłówek w bold (1 linia).` : '',
    v.italicFrag ? `Dodaj 1-zdaniowy *fragment kursywą* po leadzie lub przed akapitami.` : '',
    v.extraPull  ? `Dodaj jeden dodatkowy blockquote (pull-quote) po akapitach.` : '',
    v.leadAtEnd  ? `Dodaj dodatkowy blockquote na końcu sekcji Treść (lead-konkluzja).` : '',
  ].filter(Boolean).join(' ');

  const strictTemplate =
`# ${title}

> **Czas nauki:** ok. <liczba> minut  
> **Trudność:** <1–4>  
> **Rodzaj materiału:** <np. Temat główny | Związek między tematami | Ćwiczenie>  
> **Umiejętności:** <2–4 elementy CSV>  
> **Powiązania:** <lista CSV lub średniki>

### Cel nauki
<1–2 zdania – cel praktyczny lub interpretacyjny>

### Treść
# ${title}
> <lead: 1–2 zdania – z tezą / obrazem; unikaj fraz: ${avoid.join(', ')}>

${v.boldMini ? `**<mini-nagłówek: 3–7 słów>**\n` : ''}${v.italicFrag ? `*<1 zdanie kursywą na akcent>*\n\n` : ''}<akapit 1: 2–4 zdania – z 1–2 **pogrubieniami** (${domain.join(', ')})>

<akapit 2: 2–4 zdania – rozwinięcie z 1–2 **pogrubieniami**>

<opcjonalny akapit 3: 2–4 zdania – mini-synteza lub ograniczenia>

${v.extraPull ? `> <pull-quote: 1 zdanie – skrót najważniejszej myśli>\n\n` : ''}${v.leadAtEnd ? `> <lead-konkluzja: 1 zdanie na finał>\n\n` : ''}### Sonda / Źródło / Zajawka
<1 zdanie – pytanie lub ciekawostka spinająca wątek>`;

  const prompt =
    'Wygeneruj DOKŁADNIE 1 koncept edukacyjny (po polsku, poziom liceum). ' +
    'Bądź zwięzły, klarowny; unikaj fraz szablonowych. ' +
    variantHints + '\n\n' +
    `Kontekst: Przedmiot=${ctx.subjectName}; Sekcja=${ctx.sectionTitle}; OpisSekcji=${ctx.sectionDescription}; ` +
    `Temat=${ctx.topicTitle}; OpisTematu=${ctx.topicDescription}; TytułH1="${title}".\n\n` +
    formatRules + '\n\n' +
    strictTemplate;

  let md = '';
  try { md = await generateMarkdown(prompt); }
  catch { md = conceptMarkdownFromTitle(title, ctx); }

  return ensureFormattedConcept(md, title, ctx.topicTitle, v);
}

/* ======================== STRAŻNIK + NAPRAWCZY ======================== */
function ensureFormattedConcept(md: string, title: string, topicTitle: string | undefined, v: Variant): string {
  let out = (md || '').replace(/\r/g, '');

  // 1) H1 na początku
  if (!out.startsWith('# ')) out = `# ${title}\n\n` + out;

  // 2) Wytnij wszystko między H1 a metadanymi
  const lines = out.split('\n');
  let metaStart = -1;
  for (let i = 1; i < lines.length; i++) {
    if (/^>\s*\*\*Czas nauki:\*\*/.test(lines[i])) { metaStart = i; break; }
  }

  let stray: string[] = [];
  if (metaStart === -1) {
    stray = lines.slice(1).filter(s => s.trim() !== '');
    const inject = [
      `> **Czas nauki:** ok. 5 minut  `,
      `> **Trudność:** 2  `,
      `> **Rodzaj materiału:** Temat główny  `,
      `> **Umiejętności:** interpretacja, analiza kontekstu  `,
      `> **Powiązania:** ${topicTitle && topicTitle.trim() ? topicTitle : title}`,
      ``
    ];
    out = [lines[0], '', ...inject].join('\n');
  } else if (metaStart > 1) {
    stray = lines.slice(1, metaStart).filter(s => s.trim() !== '');
    out = [lines[0], '', ...lines.slice(metaStart)].join('\n');
  }

  // 3) Znormalizuj blok metadanych
  out = normalizeMetadataBlock(out, topicTitle ?? title);

  // 4) Dołącz „stray” w Treści (kursywa lub akapit)
  if (stray.length) {
    const strayOne = collapseToSentence(stray.join(' '), 220);
    const insert = v.italicFrag ? `\n*${strayOne}*\n` : `\n${strayOne}\n`;
    out = out.replace(
      /(^###\s+Treść\s*$)([\s\S]*?)(^\#\s+.*$)(\n>[\s\S]*?\n)/m,
      (_m, hdr, _before, innerH1, lead) => `${hdr}\n${innerH1}${lead}${insert}`
    ) || out;
  }

  // 5) Upewnij się, że sekcje istnieją
  if (!/^###\s+Cel nauki\s*$/m.test(out)) out += `\n\n### Cel nauki\n<1–2 zdania>\n`;
  if (!/^###\s+Treść\s*$/m.test(out)) out += `\n\n### Treść\n# ${title}\n> <lead>\n\n<akapit 1>\n\n<akapit 2>\n`;
  else if (!/^###\s+Treść\s*$(?:[\s\S]*?)^\#\s+/m.test(out)) {
    out = out.replace(/^###\s+Treść\s*$/m, `### Treść\n# ${title}`);
  }
  if (!/^###\s+Sonda\s*\/\s*Źródło\s*\/\s*Zajawka\s*$/m.test(out)) out += `\n\n### Sonda / Źródło / Zajawka\n<1 zdanie>\n`;

  // 6) Higiena
  out = out.replace(/\n{3,}/g, '\n\n').trim() + '\n';
  return out;
}

function normalizeMetadataBlock(src: string, relation: string): string {
  const lines = src.split('\n');
  let i = lines.findIndex(l => /^>\s*\*\*Czas nauki:\*\*/.test(l));
  if (i === -1) {
    const h1 = lines[0] || '# ';
    const inject = [
      `> **Czas nauki:** ok. 5 minut  `,
      `> **Trudność:** 2  `,
      `> **Rodzaj materiału:** Temat główny  `,
      `> **Umiejętności:** interpretacja, analiza kontekstu  `,
      `> **Powiązania:** ${relation}`,
      ``
    ];
    return [h1, '', ...inject, ...lines.slice(1)].join('\n');
  }

  const block: string[] = [];
  let j = i;
  while (j < lines.length && /^\s*>\s*/.test(lines[j])) {
    if (lines[j].trim()) block.push(lines[j].replace(/\s+$/,''));
    j++;
  }

  const kv = new Map<string,string>();
  for (const ln of block) {
    const m = ln.match(/^>\s*\*\*(.+?):\*\*\s*(.+?)\s*$/);
    if (m) kv.set(m[1].trim(), m[2].trim());
  }

  const norm = [
    `> **Czas nauki:** ${kv.get('Czas nauki') || 'ok. 5 minut'}  `,
    `> **Trudność:** ${kv.get('Trudność') || '2'}  `,
    `> **Rodzaj materiału:** ${kv.get('Rodzaj materiału') || 'Temat główny'}  `,
    `> **Umiejętności:** ${kv.get('Umiejętności') || 'interpretacja, analiza kontekstu'}  `,
    `> **Powiązania:** ${kv.get('Powiązania') || relation}`,
    ``
  ];

  const head = lines.slice(0, i).join('\n').replace(/\n+$/,'');
  const tail = lines.slice(j).join('\n').replace(/^\n+/, '');
  return [head, '', ...norm, tail].join('\n');
}

function collapseToSentence(s: string, max = 220): string {
  const clean = s.replace(/\s+/g, ' ').trim();
  const stop = clean.search(/[.!?]\s|$/);
  const cut = stop > 0 ? clean.slice(0, stop + 1) : clean;
  return (cut.length <= max ? cut : (cut.slice(0, max).replace(/\s+\S*$/, ''))) || clean.slice(0, Math.min(120, clean.length));
}
