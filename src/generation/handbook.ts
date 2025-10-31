// file: src/generation/handbook.ts
import fs from 'node:fs';
import path from 'node:path';
import { generateMarkdown, generateJson } from '../llm/openai';
import { generateStudyNotes, StudyNotesMode } from './study_notes';

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

type GenreStyle = {
  name: string;
  narrativeStyle: string;
  dialogStyle: string;
  descriptionStyle: string;
  exampleGood: string;
  exampleBad: string;
};

const GENRE_STYLES: Record<string, GenreStyle> = {
  realism: {
    name: 'Realizm XIX w.',
    narrativeStyle: 'Detale codzienności, obserwacja społeczna, konkretne miejsca i czasy',
    dialogStyle: 'Naturalne rozmowy z gestami i reakcjami; dialog wpleciony w akcję',
    descriptionStyle: 'Szczegóły ubioru, wnętrz, przedmiotów; światło, dźwięki, zapachy',
    exampleGood: '– Panie Rzecki! – woła głos z zaplecza. – Gdzie jest ten rachunek?\nRzecki szybko chowa zeszyt pod stertę papierów.\n– Zaraz, panie Wokulski, zaraz...',
    exampleBad: '**DIALOG**\n– Dzień dobry.\n– Dzień dobry.\n(Bohater jest zmęczony i zamyślony.)'
  },
  psychological: {
    name: 'Realizm psychologiczny',
    narrativeStyle: 'Wewnętrzne napięcia, obserwacja myśli przez działanie, gesty zdradzające emocje',
    dialogStyle: 'Podteksty, niedopowiedzenia, przerwy w mówieniu; to co NIE powiedziane jest ważne',
    descriptionStyle: 'Detale pokazujące stan wewnętrzny: drżące ręce, pot, unikanie wzroku',
    exampleGood: '– Czy pan... – Raskolnikow przerywa. Patrzy na własne dłonie.\n– Czy pan widział? – pyta w końcu starzec.\nRaskolnikow milczy. Słychać tykanie zegara.',
    exampleBad: 'Raskolnikow czuje wyrzuty sumienia i jest rozdarty wewnętrznie. Myśli o zbrodni.'
  },
  fantasy: {
    name: 'Fantasy/Przygoda',
    narrativeStyle: 'Dynamiczna akcja, magia jako element rzeczywistości, rytm scen akcji i dialogu',
    dialogStyle: 'Żywe, często szybkie wymiany; reakcje natychmiastowe; humor lub napięcie',
    descriptionStyle: 'Detale magiczne, niezwykłe stworzenia, zaklęcia - ale konkretnie, nie ogólnie',
    exampleGood: '– Expelliarmus! – krzyczy Harry.\nRóżdżka Malfoya wystrzeliwuje w powietrze. Draco cofa się, potyka o krzesło.\n– Oddaj to! – syka.',
    exampleBad: 'Harry używa zaklęcia i wygrywa pojedynek. Czuje satysfakcję i dumę ze swojej magii.'
  },
  modernist: {
    name: 'Modernizm/Egzystencjalizm',
    narrativeStyle: 'Fragmentaryczność, absurd codzienności, powtórzenia, monotonia lub chaos',
    dialogStyle: 'Często bezcelowe rozmowy, powtórzenia, brak logicznej progresji',
    descriptionStyle: 'Detale codzienności nabierające dziwności; zwykłe rzeczy opisane precyzyjnie i obco',
    exampleGood: 'Gregor leży na plecach. Widzi sufit. Sufit jest biały. Słyszy kroki za drzwiami.\n– Gregor? – woła matka. – Gregor?\nNie odpowiada. Nie może.',
    exampleBad: 'Gregor czuje się wyobcowany i nie rozumie swojej metamorfozy. Jest w kryzysie egzystencjalnym.'
  },
  romantic: {
    name: 'Romantyzm',
    narrativeStyle: 'Emocje przez działanie, natura jako tło, wielkie gesty i konflikty',
    dialogStyle: 'Patetyczne, ale konkretne; przysięgi, oskarżenia, wyznania - przez działanie',
    descriptionStyle: 'Przyroda, burze, księżyc, ruiny - ale pokazane konkretnymi obrazami',
    exampleGood: 'Konrad unosi ręce do nieba. Wiatr szarpie jego płaszcz.\n– Oskarżam! – krzyczy w ciemność.\nGrom odpowiada mu echem w górach.',
    exampleBad: 'Konrad przeżywa głęboki kryzys duchowy i buntuje się przeciwko Bogu w sposób romantyczny.'
  }
};

/** Auto-detekcja gatunku na podstawie tytułu i autora */
async function detectGenre(workTitle: string, author: string): Promise<keyof typeof GENRE_STYLES> {
  const prompt = {
    instruction: `Określ gatunek literacki dzieła na podstawie tytułu i autora. Zwróć JSON.`,
    work: workTitle,
    author: author,
    availableGenres: Object.keys(GENRE_STYLES),
    outputFormat: {
      genre: 'jedna z: realism, psychological, fantasy, modernist, romantic',
      confidence: 'liczba 0-100',
      reasoning: 'krótkie uzasadnienie (1 zdanie)'
    }
  };

  try {
    const result = await generateJson<{ genre: string; confidence: number; reasoning: string }>(
      JSON.stringify(prompt, null, 2)
    );
    
    const detectedGenre = result.genre.toLowerCase();
    
    // Jeśli AI zwróciło poprawny gatunek i ma wysoką pewność
    if (GENRE_STYLES[detectedGenre] && result.confidence > 60) {
      console.log(`🎭 Wykryto gatunek: ${GENRE_STYLES[detectedGenre].name} (${result.confidence}%) - ${result.reasoning}`);
      return detectedGenre as keyof typeof GENRE_STYLES;
    }
  } catch (err) {
    console.warn('⚠️  Auto-detekcja gatunku nie powiodła się, używam domyślnego (realism)');
  }

  // Fallback: prosta heurystyka
  const lowerTitle = workTitle.toLowerCase();
  const lowerAuthor = author.toLowerCase();

  if (lowerAuthor.includes('dostojewski') || lowerAuthor.includes('kafka') || lowerAuthor.includes('camus')) {
    return 'psychological';
  }
  if (lowerAuthor.includes('rowling') || lowerAuthor.includes('tolkien') || lowerAuthor.includes('sapkowski') ||
      lowerTitle.includes('harry') || lowerTitle.includes('potter') || lowerTitle.includes('wiedźmin')) {
    return 'fantasy';
  }
  if (lowerAuthor.includes('mickiewicz') || lowerAuthor.includes('słowacki') || lowerTitle.includes('dziady')) {
    return 'romantic';
  }
  if (lowerAuthor.includes('kafka') || lowerTitle.includes('proces') || lowerTitle.includes('przemiana')) {
    return 'modernist';
  }

  // Domyślnie realism (bezpieczny wybór dla polskiej literatury XIX w.)
  return 'realism';
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}
function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
function unwrapCodeFence(s: string) {
  const trimmed = s.replace(/\r/g, '').trim();
  const fenced = trimmed.match(/^```[a-zA-Z0-9-]*\n([\s\S]*?)\n```$/);
  if (fenced) return fenced[1].trim();
  return trimmed.replace(/^```[a-zA-Z0-9-]*\n?/, '').replace(/\n?```$/, '').trim();
}
function slugifyPolish(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[ąćęłńóśźż]/g, (c) => ({ 'ą':'a','ć':'c','ę':'e','ł':'l','ń':'n','ó':'o','ś':'s','ź':'z','ż':'z' } as any)[c] || c)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 120);
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
    if (line.startsWith('```')) break;
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
  return items;
}

/** Usuwa etykiety typu [Miejsce: X; pora: Y; kto: Z] → *[X; Y; Z]* i czyści drobne artefakty. */
function sanitizeOrientation(md: string) {
  let out = md.replace(
    /\[(?:Miejsce|miejsce)\s*:\s*([^;\]]+);\s*(?:pora|czas)\s*:\s*([^;\]]+);\s*(?:kto|bohaterowie)\s*:\s*([^\]]+)\]/g,
    (_m, a, b, c) => `*[${String(a).trim()}; ${String(b).trim()}; ${String(c).trim()}]*`
  );
  out = out.replace(/^\s*\[([^[\]]+?)\]\s*$/m, (_m, inside) => `*[${String(inside).trim()}]*`);
  out = out.replace(/(\*\[[^\]]+\]\*)\s*\n\s*(\*\[[^\]]+\]\*)/g, '$1');
  return out;
}

/** „Miękka" sanityzacja: bez twardej walidacji; tylko delikatne poprawki formatów. */
function softSanitize(md: string) {
  let out = md.replace(/\r/g, '');
  out = out.replace(/\bPrzejścia:/g, '*Przejście:*').replace(/(^|\n)Przejście:/g, '$1*Przejście:*');
  out = sanitizeOrientation(out);
  out = out.replace(/(^##[^\n]+?\n)\*([^*][^\n]*?)\*\n/, (_m, head, body) => `${head}${body}\n`);
  return out.trim() + '\n';
}

/** Monolit: ToC + rozdziały do jednego pliku (bez DB). */
export async function generateHandbook(input: HandbookInput): Promise<HandbookResult> {
  const targetMinutes = clamp(Math.round(input.targetMinutes ?? 5), 3, 8);
  const desiredChapters = clamp(Math.round(input.desiredChapters ?? 12), 10, 15);
  const outDir = input.outDir || path.join('debug', 'handbooks');
  ensureDir(outDir);

  // Auto-detekcja gatunku
  const genre = await detectGenre(input.workTitle, input.author);
  const style = GENRE_STYLES[genre];

  const prompt = [
    `Zwróć WYŁĄCZNIE czysty Markdown (bez code fence'ów).`,
    `Tworzysz narracyjny skrót dzieła "${input.workTitle}" — ${input.author}.`,
    ``,
    `═══════════════════════════════════════════════════════════════`,
    `STYL NARRACJI (${style.name})`,
    `═══════════════════════════════════════════════════════════════`,
    ``,
    `✓ NARRACJA: ${style.narrativeStyle}`,
    `✓ DIALOGI: ${style.dialogStyle}`,
    `✓ OPISY: ${style.descriptionStyle}`,
    ``,
    `✓ UNIWERSALNE ZASADY:`,
    `  • Czas teraźniejszy, trzecia osoba`,
    `  • SHOW DON'T TELL - pokazuj, nie opisuj`,
    `  • Immersyjny, filmowy - akcja w ruchu`,
    `  • ZERO analiz, metafor, ocen moralnych`,
    `  • ZERO oznaczeń technicznych (typu "**DIALOG**")`,
    ``,
    `PRZYKŁAD DOBRY dla tego gatunku:`,
    style.exampleGood,
    ``,
    `PRZYKŁAD ZŁY (NIE TAK):`,
    style.exampleBad,
    ``,
    `═══════════════════════════════════════════════════════════════`,
    ``,
    `# ${input.workTitle} — wersja skrócona`,
    ``,
    `(Napisz 1 akapit immersyjnego wprowadzenia do świata przedstawionego - jak scenografia teatralna lub pierwsze ujęcie filmu. Konkretne obrazy, nie abstrakcje.)`,
    ``,
    `## Spis treści`,
    ``,
    `(${desiredChapters} rozdziałów w formacie:)`,
    `- 1. **<Tytuł rozdziału>** — [miejsce; czas; kto]; 1-2 zdania streszczenia akcji (co się dzieje, nie analizy)`,
    ``,
    `PRZYKŁAD dobrego wpisu:`,
    `- 1. **Sklep na Krakowskim Przedmieściu** — [sklep Wokulskiego; sierpień 1878, ranek; Wokulski, Rzecki]; Wokulski wraca do sklepu po nieudanym spotkaniu. Rzecki obserwuje jego zmianę.`,
    ``,
    `ZŁE przykłady (NIE TAK):`,
    `- "Przedstawienie głównego bohatera" (za ogólne)`,
    `- "Konflikt wewnętrzny protagonisty" (analiza, nie akcja)`,
    `- "Bohater staje przed wyborem" (abstrakcja bez konkretów)`,
    ``,
    `---`,
    ``,
    `## Rozdział 1: <Tytuł>`,
    `*[Miejsce; czas; kto]*`,
    ``,
    `(Ta sekcja jest placeholder - treść rozdziałów powstanie później)`,
    ``,
    `## Epilog`,
    `(1-3 zdania zamykające akcję; konkretny obraz końcowy, nie morał)`,
  ].join('\n');

  const raw = await generateMarkdown(prompt);
  let markdown = unwrapCodeFence(raw);
  if (!/^\s*#\s+/.test(markdown)) markdown = `# ${input.workTitle} — wersja skrócona\n\n${markdown}`;

  const cleaned = softSanitize(markdown);

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const safeTitle = slugifyPolish(input.workTitle);
  const mdPath = path.join(outDir, `handbook-${safeTitle}-${ts}.md`);
  fs.writeFileSync(mdPath, cleaned + '\n', 'utf8');

  return { markdownPath: mdPath };
}

export type AppendOpts = {
  studyNotesMode?: StudyNotesMode;
  validate?: boolean;
  force?: boolean;
  range?: { from: number; to: number };
  outDir?: string;
};

/** Rozdział po rozdziale → pliki + (opcjonalnie) notatki (miękki tryb scenic). */
export async function appendChaptersIndividuallyFromToc(args: {
  filePath: string;
  workTitle: string;
  author: string;
  targetMinutesPerChapter?: number;
} & AppendOpts): Promise<{ outDir: string; written: Array<{ index: number; title: string; path: string }> }> {
  const src = fs.readFileSync(args.filePath, 'utf8').replace(/\r/g, '');
  const toc = parseToc(src);
  if (!toc.length) throw new Error('Brak spisu treści.');

  const baseName = path.basename(args.filePath).replace(/\.md$/i, '');
  const baseOut = args.outDir || path.join(path.dirname(args.filePath), `${baseName}.chapters`);
  ensureDir(baseOut);

  const wordsHint = Math.round((args.targetMinutesPerChapter ?? 1.0) * 160);

  // Auto-detekcja gatunku
  const genre = await detectGenre(args.workTitle, args.author);
  const style = GENRE_STYLES[genre];

  const results: Array<{ index: number; title: string; path: string }> = [];
  const from = Math.max(1, args.range?.from ?? 1);
  const to = Math.min(toc.length, args.range?.to ?? toc.length);

  for (let i = from; i <= to; i++) {
    const ch = toc[i - 1];
    const next = i < toc.length ? toc[i] : null;
    const nextTitle = next ? next.title : '';

    const prompt = [
      `Zwróć WYŁĄCZNIE czysty Markdown (bez code fence'ów).`,
      ``,
      `DZIEŁO: "${args.workTitle}" — ${args.author}`,
      `ROZDZIAŁ ${i}: ${ch.title}`,
      `STRESZCZENIE: ${ch.description}`,
      ``,
      `═══════════════════════════════════════════════════════════════`,
      `STYL NARRACJI (${style.name})`,
      `═══════════════════════════════════════════════════════════════`,
      ``,
      `✓ NARRACJA: ${style.narrativeStyle}`,
      `✓ DIALOGI: ${style.dialogStyle}`,
      `✓ OPISY: ${style.descriptionStyle}`,
      ``,
      `✓ UNIWERSALNE ZASADY:`,
      `  • Czas teraźniejszy, trzecia osoba`,
      `  • SHOW DON'T TELL:`,
      `    - NIE: "jest zmęczony" → TAK: "ma podkrążone oczy"`,
      `    - NIE: "jest zdenerwowany" → TAK: "zaciska pięści"`,
      `    - NIE: "myśli o niej" → TAK: "patrzy przez okno w stronę pałacu"`,
      `  • Immersyjny, filmowy - akcja w ruchu, nie statyczne opisy`,
      `  • ZERO analiz psychologicznych, metafor, ocen moralnych`,
      `  • ZERO oznaczeń technicznych (typu "**DIALOG — blok nieprzerwany**")`,
      ``,
      `✓ DIALOGI NATURALNE wplecione w akcję:`,
      `  • Każda kwestia poprzedzona "–" (półpauza)`,
      `  • Między wypowiedziami: gesty, reakcje, ruch`,
      `  • Dialog prowadzi akcję, NIE jest jej przerwą`,
      ``,
      `PRZYKŁAD DOBRY dla tego gatunku:`,
      style.exampleGood,
      ``,
      `PRZYKŁAD ZŁY (NIE TAK):`,
      style.exampleBad,
      ``,
      `═══════════════════════════════════════════════════════════════`,
      `STRUKTURA ROZDZIAŁU`,
      `═══════════════════════════════════════════════════════════════`,
      ``,
      `## Rozdział ${i}: ${ch.title}`,
      `*[${ch.description.split(';').slice(0, 3).join('; ')}]*`,
      ``,
      `(2-4 zdania wprowadzające - konkretny obraz miejsca/sytuacji, nie abstrakcja)`,
      ``,
      `(Teraz rozwiń scenę: akcja, dialogi wplecione w ruch, opisy między wymianami.`,
      `Pamiętaj: dialog NIE jest oddzielnym blokiem, jest częścią narracji.`,
      `Długość dowolna, ale ~${wordsHint} słów to dobry punkt odniesienia.)`,
      ``,
      nextTitle 
        ? `*Przejście:* ${nextTitle}` 
        : `(Zamknij scenę naturalnie, bez zapowiedzi - to ostatni rozdział przed epilogiem)`,
      ``,
      `═══════════════════════════════════════════════════════════════`,
      `PRZYPOMNIENIE: Pisz jak scenę ${style.name.toLowerCase()}.`,
      `NIE pisz suchych wymian zdań. NIE oznaczaj bloków dialogowych.`,
      `Pokaż świat i postaci w akcji, nie opisuj ich stanów wewnętrznych.`,
      `═══════════════════════════════════════════════════════════════`,
    ].join('\n');

    let md = unwrapCodeFence(await generateMarkdown(prompt));
    if (!/^##\s+Rozdział\s+\d+:/m.test(md)) md = `## Rozdział ${i}: ${ch.title}\n${md}\n`;

    md = softSanitize(md);

    const safeTitle = slugifyPolish(ch.title);
    const file = path.join(baseOut, `ch-${String(i).padStart(2, '0')}-${safeTitle}.md`);
    if (!fs.existsSync(file) || args.force) {
      let finalMd = md.trim() + '\n';
      const mode: StudyNotesMode = args.studyNotesMode ?? 'inline';
      if (mode !== 'none') {
        const notes = await generateStudyNotes({
          workTitle: args.workTitle,
          author: args.author,
          chapterIndex: i,
          chapterTitle: ch.title,
          chapterMarkdown: md,
        });
        if (mode === 'inline') {
          finalMd += `\n${notes}\n`;
        } else if (mode === 'sidecar') {
          const sidecar = file.replace(/\.md$/, '.notes.md');
          fs.writeFileSync(sidecar, notes + '\n', 'utf8');
        }
      }
      fs.writeFileSync(file, finalMd, 'utf8');
    }

    results.push({ index: i, title: ch.title, path: file });
  }

  // Epilog
  const epilogPrompt = [
    `Zwróć WYŁĄCZNIE czysty Markdown (bez code fence'ów).`,
    ``,
    `DZIEŁO: "${args.workTitle}" — ${args.author}`,
    ``,
    `## Epilog`,
    ``,
    `Napisz 1-3 zdania zamykające akcję całego dzieła.`,
    ``,
    `STYL (${style.name}):`,
    `- ${style.narrativeStyle}`,
    `- Konkretny obraz końcowy (co widać, kto gdzie jest)`,
    `- Czas teraźniejszy`,
    `- ZERO morałów, analiz, metafor`,
    `- Jak ostatnie ujęcie filmu - pokazuje, nie tłumaczy`,
    ``,
    `PRZYKŁAD DOBRY:`,
    `"Wokulski stoi przy oknie i patrzy na ulicę. Rzecki liczy monety przy ladzie. Sklep jest cichy."`,
    ``,
    `PRZYKŁAD ZŁY (nie tak):`,
    `"Bohater nauczył się że miłość wymaga poświęceń i zrozumiał sens życia."`,
  ].join('\n');

  const epilogMd = softSanitize(unwrapCodeFence(await generateMarkdown(epilogPrompt)));
  const epilog = /^##\s+Epilog/m.test(epilogMd) ? epilogMd : `## Epilog\n${epilogMd}\n`;
  fs.writeFileSync(path.join(baseOut, `epilog.md`), epilog + '\n');

  return { outDir: baseOut, written: results };
}