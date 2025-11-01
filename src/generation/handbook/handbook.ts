// file: src/generation/handbook.ts
import fs from 'node:fs';
import path from 'node:path';
import { generateMarkdown } from '../../llm/openai';
import { planNarrativeStructure, NarrativePlan, ChapterPlan } from './narrative_planner';
import { generateFinalStudySection, ChapterSummary } from './final_study_section';
import { detectGenreFromStyle, formatGenreExampleForPrompt, getGenreExample } from './genre_examples';
import { loadOrGenerateCustomExample } from './custom_example_cache';

export type HandbookInput = {
  workTitle: string;
  author: string;
  targetMinutes?: number;
  desiredChapters?: number;
  outDir?: string;
};

export type HandbookResult = {
  markdownPath: string;
  narrativePlan: NarrativePlan;
};

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
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[ąćęłńóśźż]/g, (c) =>
      ({ ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' } as any)[c] || c
    )
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 120);
}

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

function sanitizeOrientation(md: string) {
  let out = md.replace(
    /\[(?:Miejsce|miejsce)\s*:\s*([^;\]]+);\s*(?:pora|czas)\s*:\s*([^;\]]+);\s*(?:kto|bohaterowie)\s*:\s*([^\]]+)\]/g,
    (_m, a, b, c) => `*[${String(a).trim()}; ${String(b).trim()}; ${String(c).trim()}]*`
  );
  out = out.replace(/^\s*\[([^[\]]+?)\]\s*$/m, (_m, inside) => `*[${String(inside).trim()}]*`);
  out = out.replace(/(\*\[[^\]]+\]\*)\s*\n\s*(\*\[[^\]]+\]\*)/g, '$1');
  return out;
}

function softSanitize(md: string) {
  let out = md.replace(/\r/g, '');
  out = out.replace(/\bPrzejścia:/g, '*Przejście:*').replace(/(^|\n)Przejście:/g, '$1*Przejście:*');
  out = sanitizeOrientation(out);
  out = out.replace(/(^##[^\n]+?\n)\*([^*][^\n]*?)\*\n/, (_m, head, body) => `${head}${body}\n`);
  return out.trim() + '\n';
}

export async function generateHandbook(input: HandbookInput): Promise<HandbookResult> {
  const targetMinutes = clamp(Math.round(input.targetMinutes ?? 5), 3, 8);
  const desiredChapters = clamp(Math.round(input.desiredChapters ?? 12), 10, 15);
  const outDir = input.outDir || path.join('debug', 'handbooks');
  ensureDir(outDir);

  console.log(`🎭 Faza 1: Planowanie struktury narracyjnej...`);
  const narrativePlan = await planNarrativeStructure(input.workTitle, input.author, desiredChapters);

  const prompt = [
    `Zwróć WYŁĄCZNIE czysty Markdown (bez code fence'ów).`,
    ``,
    `DZIEŁO: "${input.workTitle}" — ${input.author}`,
    ``,
    `STRUKTURA NARRACYJNA (już ustalona):`,
    `- Voice: ${narrativePlan.narrativeVoice}`,
    `- Style: ${narrativePlan.styleInspiration}`,
    `- Tone: ${narrativePlan.overallTone}`,
    ``,
    `ZADANIE: Napisz wstęp + spis treści dla ${desiredChapters} rozdziałów.`,
    ``,
    `FORMAT:`,
    `# ${input.workTitle} — wersja skrócona`,
    ``,
    `(1 akapit immersyjnego wprowadzenia - jak pierwsze ujęcie filmu, konkretne obrazy)`,
    ``,
    `## Spis treści`,
    ``,
    narrativePlan.chapters
      .map((ch) => {
        const typeLabel =
          ch.type === 'diary'
            ? '[dziennik]'
            : ch.type === 'letter'
            ? '[list]'
            : ch.type === 'monologue'
            ? '[monolog]'
            : '';
        return `- ${ch.index}. **${ch.title}** ${typeLabel} — ${ch.description}`;
      })
      .join('\n'),
  ].join('\n');

  const raw = await generateMarkdown(prompt);
  let markdown = unwrapCodeFence(raw);
  if (!/^\s*#\s+/.test(markdown)) markdown = `# ${input.workTitle} — wersja skrócona\n\n${markdown}`;

  const cleaned = softSanitize(markdown);

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const safeTitle = slugifyPolish(input.workTitle);
  const mdPath = path.join(outDir, `handbook-${safeTitle}-${ts}.md`);
  fs.writeFileSync(mdPath, cleaned + '\n', 'utf8');

  const planPath = mdPath.replace(/\.md$/, '.plan.json');
  fs.writeFileSync(planPath, JSON.stringify(narrativePlan, null, 2), 'utf8');
  console.log(`📋 Plan narracyjny: ${planPath}`);

  return { markdownPath: mdPath, narrativePlan };
}

export type AppendOpts = {
  force?: boolean;
  range?: { from: number; to: number };
  outDir?: string;
  narrativePlan?: NarrativePlan;
};

function extractKeyEvents(chapterMd: string): string[] {
  const sentences = chapterMd
    .replace(/^##.+$/gm, '')
    .replace(/\*\[.+?\]\*/g, '')
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20 && s.length < 200);

  const first3 = sentences.slice(0, 3);
  const last2 = sentences.slice(-2);
  return [...first3, ...last2].filter(Boolean);
}

async function generateChapterWithContext(args: {
  workTitle: string;
  author: string;
  chapterPlan: ChapterPlan;
  narrativePlan: NarrativePlan;
  previousChapters: Array<{ index: number; title: string; keyEvents: string[] }>;
  nextChapterTitle?: string;
  targetMinutes: number;
  mdPath: string;
}): Promise<string> {
  const { workTitle, author, chapterPlan, narrativePlan, previousChapters, nextChapterTitle, targetMinutes, mdPath } =
    args;

  const wordsTarget = Math.round(targetMinutes * 160);

  // Wykryj gatunek i załaduj przykłady
  const detectedGenre = detectGenreFromStyle(narrativePlan.styleInspiration, narrativePlan.overallTone);
  console.log(`   🎭 Gatunek: ${detectedGenre}`);

  const genreExample = getGenreExample(detectedGenre);
  if (!genreExample) {
    throw new Error(`Nieznany gatunek: ${detectedGenre}`);
  }
  const genrePrompt = formatGenreExampleForPrompt(genreExample);

  // Wczytaj lub wygeneruj custom przykład (z cache)
  const customExample = await loadOrGenerateCustomExample({
    workTitle,
    author,
    genre: detectedGenre,
    styleInspiration: narrativePlan.styleInspiration,
    mdPath,
  });

  const typeInstructions: Record<string, string> = {
    scene: [
      `═══════════════════════════════════════════════════════════════`,
      `TYP: SCENA (obiektywna narracja, trzecia osoba)`,
      `═══════════════════════════════════════════════════════════════`,
      ``,
      `KRYTYCZNE ZASADY IMMERSJI:`,
      ``,
      `1. 70% DIALOGU, 30% OPISU`,
      `   - Dialog prowadzi akcję, opis tylko między wymianami`,
      `   - Każda scena = głównie rozmowy postaci`,
      ``,
      `2. KRÓTKIE KWESTIE (1-2 zdania MAX)`,
      `   - Ludzie mówią krótko, zwłaszcza gdy są zdenerwowani`,
      `   - Długie tyrady = nienaturalne`,
      ``,
      `3. GRUPUJ DIALOG - NIE PRZEPLATAJ KAŻDEJ KWESTII OPISEM`,
      `   ❌ ZŁE (uderzanie kijem po głowie):`,
      `   "– Kwestia 1.`,
      `   Opis gestu 1.`,
      `   – Kwestia 2.`,
      `   Opis gestu 2.`,
      `   – Kwestia 3.`,
      `   Opis gestu 3."`,
      `   `,
      `   ✅ DOBRE (naturalny rytm):`,
      `   "– Kwestia 1.`,
      `   – Kwestia 2.`,
      `   – Kwestia 3.`,
      `   `,
      `   Gest/reakcja (1-2 zdania).`,
      `   `,
      `   – Kwestia 4.`,
      `   – Kwestia 5."`,
      `   `,
      `   ZASADA: 3-5 kwestii dialogu → POTEM gest/opis (jeśli potrzebny)`,
      ``,
      `4. PRZERWY W DIALOGU = GESTY/REAKCJE (ale RZADKO!)`,
      `   - Tylko gdy coś WAŻNEGO się dzieje`,
      `   - Nie po każdej kwestii!`,
      ``,
      `5. NIEDOPOWIEDZENIA, JĄKANIE, PRZERWY`,
      `   - "– Ale wie pan... nasze różnice..."`,
      `   - "– Chciałem... chciałem z panem porozmawiać."`,
      `   - Pokazuje niepewność, dyskomfort`,
      ``,
      `6. CISZA = NAPIĘCIE`,
      `   - Oznaczaj ją wprost: "Cisza. Długa, ciężka cisza."`,
      `   - Albo przez akcję: "Nikt nie odpowiada. Ktoś odkłada filiżankę."`,
      `   - Używaj RZADKO (MAX 2 razy na scenę!)`,
      ``,
      `7. GESTY ZAMIAST OPISÓW EMOCJI`,
      `   ❌ NIE: "Był zdenerwowany"`,
      `   ✅ TAK: "Krztusi się. Poprawia kołnierz."`,
      `   `,
      `   ❌ NIE: "Czuła się nieswojo"`,
      `   ✅ TAK: "Przestaje grać. Wstaje."`,
      ``,
      `8. REAKCJE FIZYCZNE = EMOCJE (GRUPUJ!)`,
      `   - Po 3-5 kwestiach dialogu: 1-2 zdania akcji`,
      `   - przestaje grać, wstaje, patrzy w okno, odwraca głowę`,
      `   - krztusi się, zaciska pięści, unika wzroku`,
      `   - odkłada przedmiot, poprawia ubranie, wychodzi`,
      ``,
      `9. NIE PISZ META-KOMENTARZY O DIALOGU`,
      `   ❌ ZŁE (bezsensowne ozdobniki):`,
      `   "Kilka krótkich zdań jedno po drugim."`,
      `   "Głosy podnoszą się, mieszają."`,
      `   "Krótko, jeden po drugim."`,
      `   "Kilka osób szepcze równocześnie, głosy nisko splecione."`,
      `   `,
      `   ✅ DOBRE:`,
      `   Po prostu pisz dialog! Jeśli chaos - pokaż przez nakładające się kwestie:`,
      `   "– Kwestia 1?`,
      `   – Nieprawda!`,
      `   – A kto pana pytał?`,
      `   `,
      `   Kilka osób mówi równocześnie."`,
      ``,
      `10. PAUZY MIĘDZY DIALOGIEM TYLKO GDY:`,
      `    - Zmiana tematu/tonu (ważna!)`,
      `    - Cisza = napięcie (MAX 2 razy na scenę!)`,
      `    - Fizyczna akcja (wstaje, wychodzi, coś upada)`,
      `    `,
      `    ❌ NIE wstawiaj jednozdaniowych "ozdobników":`,
      `    "Kilka osób szepcze równocześnie, głosy nisko splecione." ← ZŁE!`,
      `    `,
      `    ✅ Jeśli pauza - musi mieć cel:`,
      `    "Wstaje od stołu. Podchodzi do okna." ← OK (fizyczna akcja)`,
      `    "Cisza. Długa, ciężka cisza." ← OK (napięcie, ale max 2x!)`,
      ``,
      `═══════════════════════════════════════════════════════════════`,
      `PRZYKŁAD DOBREGO RYTMU:`,
      ``,
      `"– Wie pan – zaczyna ojciec – nasze nazwisko...`,
      `– Rozumiem.`,
      `– Ludzie gadają.`,
      `– Wiem.`,
      ``,
      `Córka wstaje od fortepianu. Podchodzi do matki.`,
      ``,
      `– Źle się czuję. Pójdę do siebie.`,
      `– Już, kochanie?`,
      `– Przepraszam.`,
      ``,
      `Wychodzi z salonu."`,
      ``,
      `DLACZEGO TO DZIAŁA:`,
      `✓ 4 kwestie → gest (ważny!) → 3 kwestie → gest finałowy`,
      `✓ Dialog PŁYNIE, nie jest przerywany co linijkę`,
      `✓ Gesty ZNACZĄCE (wstaje, wychodzi) nie dekoracyjne`,
      `✓ ZERO meta-komentarzy typu "głosy się mieszają"`,
      ``,
      `═══════════════════════════════════════════════════════════════`,
      genrePrompt,
      ``,
      `═══════════════════════════════════════════════════════════════`,
      `TWÓJ CUSTOM PRZYKŁAD (dla tego dzieła - WZÓR STYLU):`,
      `═══════════════════════════════════════════════════════════════`,
      ``,
      customExample,
      ``,
      `═══════════════════════════════════════════════════════════════`,
      `TERAZ PISZ SWOJĄ SCENĘ używając:`,
      `- Struktury z przykładu gatunkowego (proporcje, rytm)`,
      `- Stylu z custom przykładu (ton, atmosfera)`,
      `- Postaci i sytuacji z TWOJEGO rozdziału (nie kopiuj!)`,
      ``,
      `KLUCZOWE: GRUPUJ DIALOG! 3-5 kwestii razem, POTEM gest!`,
      `ZERO meta-komentarzy! ZERO jednozdaniowych ozdobników!`,
      `═══════════════════════════════════════════════════════════════`,
    ].join('\n'),

    diary: [
      `TYP: DZIENNIK (pierwsza osoba: ${chapterPlan.povCharacter || 'narrator'})`,
      ``,
      `ZASADY:`,
      `- Intymny ton, osobiste refleksje`,
      `- Data na początku: "15 sierpnia 1878:" lub "Dziś..."`,
      `- Pokazuj emocje przez OBSERWACJE, nie abstrakcje`,
      `  ❌ NIE: "Byłem bardzo smutny"`,
      `  ✅ TAK: "Widziałem jak stał dłużej przy oknie. Nie jadł."`,
      `- Możesz cytować dialogi które zapamiętałeś`,
      `  "Zapytałem: 'Co się stało?'"`,
      `  "Odpowiedział: 'Nic.'"`,
      `  "Ale widziałem – coś się stało."`,
      `- Krótkie akapity (jak prawdziwy dziennik)`,
      `- Czas przeszły LUB teraźniejszy (w stylu dziennika)`,
    ].join('\n'),

    letter: [
      `TYP: LIST (pierwsza osoba: ${chapterPlan.povCharacter || 'autor listu'})`,
      ``,
      `ZASADY:`,
      `- KRÓTKI (10-15 linijek MAX)`,
      `- Format: "Szanowny Panie, ..." / "Drogi [imię], ..."`,
      `- DWUZNACZNY - coś mówi, coś ukrywa`,
      `- Powinien COŚ BOLEĆ czytelnika`,
      `  Np. uprzejme odrzucenie, chłodny dystans`,
      `- Koniec: podpis`,
      ``,
      `PRZYKŁAD TONU:`,
      `"Dziękuję za wizytę. Była... pouczająca.`,
      `Proszę jednak pamiętać o różnicach, które nas dzielą.`,
      `Z wyrazami szacunku, [imię]"`,
      ``,
      `(to brzmi uprzejmie, ale BOLI - właśnie o to chodzi!)`,
    ].join('\n'),

    monologue: [
      `TYP: MONOLOG WEWNĘTRZNY (pierwsza osoba)`,
      ``,
      `ZASADY:`,
      `- Strumień myśli - fragmentaryczny, emocjonalny`,
      `- Może być chaotyczny (jak prawdziwe myśli)`,
      `- Pokazuj przez wspomnienia konkretnych scen`,
      `  ❌ NIE: "Czułem się samotny"`,
      `  ✅ TAK: "Pamiętam jak stała przy instrumencie. Nie patrzyła na mnie."`,
      `- Pytania retoryczne OK`,
      `- Niedokończone myśli OK`,
      `- EMOCJE przez detale, nie nazwy emocji`,
    ].join('\n'),

    newspaper: [
      `TYP: ARTYKUŁ GAZETOWY / DOKUMENT`,
      ``,
      `ZASADY:`,
      `- Oficjalny, suchy ton (kontrast z emocjami w scenach!)`,
      `- Format: Tytuł, Podtytuł, Lead, Treść`,
      `- KRÓTKI - gazeta nie pisze eposów`,
      `- Może zawierać plotki, domysły (to gazeta!)`,
      `- Używaj do przekazania kontekstu społecznego`,
    ].join('\n'),

    found_document: [
      `TYP: ZNALEZIONY DOKUMENT (księga rachunkowa, telegram, notatka)`,
      ``,
      `ZASADY:`,
      `- AUTENTYCZNY FORMAT (jak prawdziwy dokument)`,
      `- Krótki, fragmentaryczny`,
      `- Liczby, daty, suche fakty`,
      `- Emocje pokazane PRZEZ LICZBY`,
      `  Np. "200 zł pożyczka" (pokazuje obsesję bez słów)`,
    ].join('\n'),
  };

  const contextSummary =
    previousChapters.length > 0
      ? [
          ``,
          `═══════════════════════════════════════════════════════════════`,
          `KONTEKST: CO BYŁO WCZEŚNIEJ (MUSISZ nawiązać!)`,
          `═══════════════════════════════════════════════════════════════`,
          ``,
          ...previousChapters.map(
            (prev) =>
              `Rozdział ${prev.index}: ${prev.title}\n${prev.keyEvents.map((e) => `- ${e}`).join('\n')}\n`
          ),
          ``,
          `KRYTYCZNE:`,
          `- Twój rozdział MUSI nawiązywać do tych wydarzeń`,
          `- Postacie PAMIĘTAJĄ co się stało`,
          `- Czas i miejsca są CIĄGŁE`,
          `- Jeśli w Ch${previousChapters[previousChapters.length - 1]?.index} było napięcie,`,
          `  Twój rozdział musi to KONTYNUOWAĆ lub ROZWIĄZAĆ`,
          ``,
        ].join('\n')
      : '';

  const instructionType = chapterPlan.type as keyof typeof typeInstructions;
  const instruction = typeInstructions[instructionType] || typeInstructions.scene;

  const prompt = [
    `Zwróć WYŁĄCZNIE czysty Markdown (bez code fence'ów).`,
    ``,
    `DZIEŁO: "${workTitle}" — ${author}`,
    `ROZDZIAŁ ${chapterPlan.index}: ${chapterPlan.title}`,
    `Streszczenie: ${chapterPlan.description}`,
    ``,
    `STRUKTURA NARRACYJNA (ustalona):`,
    `- Voice: ${narrativePlan.narrativeVoice}`,
    `- Style: ${narrativePlan.styleInspiration}`,
    `- Overall Tone: ${narrativePlan.overallTone}`,
    `- Chapter Tone: ${chapterPlan.tone || narrativePlan.overallTone}`,
    ``,
    contextSummary,
    ``,
    instruction,
    ``,
    `═══════════════════════════════════════════════════════════════`,
    `DŁUGOŚĆ I STRUKTURA`,
    `═══════════════════════════════════════════════════════════════`,
    ``,
    `CEL: ~${targetMinutes} minut czytania (${wordsTarget} słów)`,
    ``,
    `STRUKTURA ROZDZIAŁU:`,
    `## Rozdział ${chapterPlan.index}: ${chapterPlan.title}`,
    chapterPlan.type === 'scene' ? `*[${chapterPlan.description.split(';').slice(0, 3).join('; ')}]*\n` : '',
    `(2-3 zdania wprowadzenia - konkretny obraz miejsca/sytuacji)`,
    ``,
    `(TERAZ GŁÓWNA CZĘŚĆ - pamiętaj: 70% dialogu, GRUPUJ kwestie!)`,
    ``,
    nextChapterTitle ? `*Przejście:* ${nextChapterTitle}` : `(Zamknij rozdział bez zapowiedzi)`,
    ``,
    `═══════════════════════════════════════════════════════════════`,
    `OSTATNIE PRZYPOMNIENIE - TO NAJWAŻNIEJSZE:`,
    ``,
    chapterPlan.type === 'scene'
      ? [
          `✓ 70% DIALOGU (rozmowy prowadzą akcję)`,
          `✓ Krótkie kwestie (1-2 zdania)`,
          `✓ GRUPUJ dialog: 3-5 kwestii → POTEM gest`,
          `✓ NIE przeplataj każdej kwestii opisem (to uderzanie kijem!)`,
          `✓ ZERO meta-komentarzy ("głosy się mieszają" etc.)`,
          `✓ ZERO jednozdaniowych ozdobników`,
          `✓ Cisza = napięcie (ale MAX 2 razy!)`,
          `✓ Gesty zamiast "był smutny"`,
          `✓ EMOCJE przez akcję, nie opisy`,
          ``,
          `WZORUJ SIĘ NA PRZYKŁADACH POWYŻEJ - zwróć uwagę na RYTM!`,
        ].join('\n')
      : `Pisz zgodnie z typem: ${chapterPlan.type}`,
    `═══════════════════════════════════════════════════════════════`,
  ].join('\n');

  let md = unwrapCodeFence(await generateMarkdown(prompt));

  if (!/^##\s+Rozdział\s+\d+:/m.test(md)) {
    md = `## Rozdział ${chapterPlan.index}: ${chapterPlan.title}\n${md}\n`;
  }

  return softSanitize(md);
}

export async function appendChaptersIndividuallyFromToc(args: {
  filePath: string;
  workTitle: string;
  author: string;
  targetMinutesPerChapter?: number;
  narrativePlan: NarrativePlan;
} & AppendOpts): Promise<{
  outDir: string;
  written: Array<{ index: number; title: string; path: string }>;
}> {
  const baseName = path.basename(args.filePath).replace(/\.md$/i, '');
  const baseOut = args.outDir || path.join(path.dirname(args.filePath), `${baseName}.chapters`);
  ensureDir(baseOut);

  const targetMinutes = args.targetMinutesPerChapter ?? 5.0;

  const results: Array<{ index: number; title: string; path: string }> = [];
  const chapterSummaries: ChapterSummary[] = [];
  const previousChapters: Array<{ index: number; title: string; keyEvents: string[] }> = [];

  const from = Math.max(1, args.range?.from ?? 1);
  const to = Math.min(args.narrativePlan.chapters.length, args.range?.to ?? args.narrativePlan.chapters.length);

  console.log(`\n📖 Generuję rozdziały ${from}-${to} z kontekstem i emocjami...`);

  for (let i = from; i <= to; i++) {
    const chapterPlan = args.narrativePlan.chapters[i - 1];
    const nextChapter = i < args.narrativePlan.chapters.length ? args.narrativePlan.chapters[i] : null;

    console.log(`\n✍️  Rozdział ${i}/${to}: "${chapterPlan.title}"`);
    console.log(`    Typ: ${chapterPlan.type} | POV: ${chapterPlan.pov}`);
    console.log(`    Cel: ~${targetMinutes} min (${Math.round(targetMinutes * 160)} słów)`);

    const md = await generateChapterWithContext({
      workTitle: args.workTitle,
      author: args.author,
      chapterPlan,
      narrativePlan: args.narrativePlan,
      previousChapters,
      nextChapterTitle: nextChapter?.title,
      targetMinutes,
      mdPath: args.filePath,
    });

    const safeTitle = slugifyPolish(chapterPlan.title);
    const file = path.join(baseOut, `ch-${String(i).padStart(2, '0')}-${safeTitle}.md`);

    if (!fs.existsSync(file) || args.force) {
      fs.writeFileSync(file, md, 'utf8');
      console.log(`   ✅ Zapisano: ${path.basename(file)}`);
    } else {
      console.log(`   ⏭️  Pominięto (już istnieje): ${path.basename(file)}`);
    }

    const keyEvents = extractKeyEvents(md);
    previousChapters.push({
      index: i,
      title: chapterPlan.title,
      keyEvents,
    });

    chapterSummaries.push({
      index: i,
      title: chapterPlan.title,
      keyEvents,
      keyQuotes: keyEvents.slice(0, 2),
    });

    results.push({ index: i, title: chapterPlan.title, path: file });
  }

  console.log(`\n📚 Generuję sekcję maturalną (lekka, na końcu)...`);
  const studySection = await generateFinalStudySection(args.workTitle, args.author, chapterSummaries);

  const studySectionPath = path.join(baseOut, '_SEKCJA_MATURALNA.md');
  fs.writeFileSync(studySectionPath, studySection, 'utf8');
  console.log(`   ✅ Sekcja maturalna: _SEKCJA_MATURALNA.md`);

  return { outDir: baseOut, written: results };
}