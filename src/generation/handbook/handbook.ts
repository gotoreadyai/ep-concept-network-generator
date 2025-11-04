// file: src/generation/handbook/handbook.ts
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

// === Stabilne ID i slug rozdziału ===
function makeChapterId(index: number) {
  return `ch-${String(index).padStart(2, '0')}`;
}
function makeChapterSlug(index: number, title: string) {
  return `${makeChapterId(index)}-${slugifyPolish(title)}`;
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
  // nie usuwamy {#...} — to ważne dla anchorów
  out = out.replace(/(^##[^\n]+?\n)\*([^*][^\n]*?)\*\n/, (_m, head, body) => `${head}${body}\n`);
  return out.trim() + '\n';
}

/** Jeśli w rozdziale nie ma panelu referencji, dodaj minimalny placeholder ze stabilnym ID rozdziału. */
function ensureStudyPanel(md: string, chapterId: string): string {
  if (md.includes('<!-- study-refs:panel:start -->')) {
    // Upewnij się, że istniejący panel ma data-chapter ustawione poprawnie (jeśli brak — uzupełnij)
    return md.replace(
      /(<study-refs-panel)(\b[^>]*?)>/,
      (_m, tag, attrs) =>
        attrs.includes('data-chapter=')
          ? `${tag}${attrs}>`
          : `${tag}${attrs} data-chapter="${chapterId}">`
    );
  }
  const needsNL = md.endsWith('\n') ? '' : '\n';
  const panel = [
    '<!-- study-refs:panel:start -->',
    `<study-refs-panel data-chapter="${chapterId}"></study-refs-panel>`,
    '<!-- study-refs:panel:end -->',
    '',
  ].join('\n');
  return md + needsNL + '\n' + panel;
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
      `1. 70% DIALOGU, 30% OPISU (to domyślna rama — dopuszczalne odchylenie ±20% zależnie od sceny)`,
      `   - Dialog prowadzi akcję, opis tylko między wymianami`,
      `   - W wyjątkach (kontekst/światotwórstwo) opis może chwilowo przeważyć`,
      ``,
      `2. KRÓTKIE KWESTIE (1-2 zdania MAX)`,
      `3. GRUPUJ DIALOG (3–5 kwestii) → potem gest/reakcja`,
      `4. CISZA = NAPIĘCIE (max 2 na scenę)`,
      `5. GESTY zamiast nazw emocji`,
      `6. ZERO meta-komentarzy o dialogu`,
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
      `TERAZ PISZ SCENĘ w tym rytmie/stylu.`,
      `═══════════════════════════════════════════════════════════════`,
    ].join('\n'),

    diary: [
      `TYP: DZIENNIK (pierwsza osoba: ${chapterPlan.povCharacter || 'narrator'})`,
      ``,
      `ZASADY:`,
      `- Intymny ton, obserwacje → emocje`,
      `- Data lub "Dziś..." na początku`,
      `- Krótkie akapity, cytaty zapamiętane OK`,
    ].join('\n'),

    letter: [
      `TYP: LIST (pierwsza osoba: ${chapterPlan.povCharacter || 'autor listu'})`,
      ``,
      `ZASADY:`,
      `- 10–15 linijek, grzeczna dwuznaczność`,
      `- Koniec: podpis`,
    ].join('\n'),

    monologue: [
      `TYP: MONOLOG WEWNĘTRZNY`,
      ``,
      `ZASADY:`,
      `- Fragmentaryczny tok myśli, detale zamiast nazw emocji`,
    ].join('\n'),

    newspaper: [
      `TYP: ARTYKUŁ GAZETOWY / DOKUMENT`,
      ``,
      `ZASADY:`,
      `- Lead, treść, ton oficjalny`,
      `- Krótko, konkretnie`,
    ].join('\n'),

    found_document: [
      `TYP: ZNALEZIONY DOKUMENT`,
      ``,
      `ZASADY:`,
      `- Autentyczny format (daty, liczby), fragmentarycznie`,
    ].join('\n'),
  };

  const contextSummary =
    previousChapters.length > 0
      ? [
          ``,
          `═══════════════════════════════════════════════════════════════`,
          `KONTEKST: CO BYŁO WCZEŚNIEJ (NAWIĄŻ!)`,
          `═══════════════════════════════════════════════════════════════`,
          ``,
          ...previousChapters.map(
            (prev) =>
              `Rozdział ${prev.index}: ${prev.title}\n${prev.keyEvents.map((e) => `- ${e}`).join('\n')}\n`
          ),
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
    `CEL: ~${wordsTarget} słów`,
    ``,
    `STRUKTURA ROZDZIAŁU:`,
    `## Rozdział ${chapterPlan.index}: ${chapterPlan.title} {#${makeChapterId(chapterPlan.index)}}`,
    chapterPlan.type === 'scene' ? `*[${chapterPlan.description.split(';').slice(0, 3).join('; ')}]*\n` : '',
    `(2-3 zdania wprowadzenia - konkretny obraz miejsca/sytuacji)`,
    ``,
    `(TERAZ GŁÓWNA CZĘŚĆ - dialog prowadzi akcję, ale elastycznie ±20%)`,
    ``,
    nextChapterTitle ? `*Przejście:* ${nextChapterTitle}` : `(Zamknij rozdział bez zapowiedzi)`,
    ``,
  ].join('\n');

  let md = unwrapCodeFence(await generateMarkdown(prompt));

  if (!/^##\s+Rozdział\s+\d+:/m.test(md)) {
    md = `## Rozdział ${chapterPlan.index}: ${chapterPlan.title} {#${makeChapterId(chapterPlan.index)}}\n${md}\n`;
  }

  // sanity + placeholder panelu referencji (HTML) dla wstawek kontekstowych
  md = softSanitize(md);
  md = ensureStudyPanel(md, makeChapterId(chapterPlan.index));

  return md;
}

export async function appendChaptersIndividuallyFromToc(args: {
  filePath: string;
  workTitle: string;
  author: string;
  targetMinutesPerChapter?: number;
  narrativePlan: NarrativePlan;
} & AppendOpts): Promise<{
  outDir: string;
  written: Array<{ index: number; title: string; path: string; id: string; slug: string }>;
}> {
  const baseName = path.basename(args.filePath).replace(/\.md$/i, '');
  const baseOut = args.outDir || path.join(path.dirname(args.filePath), `${baseName}.chapters`);
  ensureDir(baseOut);

  const targetMinutes = args.targetMinutesPerChapter ?? 5.0;

  const results: Array<{ index: number; title: string; path: string; id: string; slug: string }> = [];
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

    const id = makeChapterId(i);
    const slug = makeChapterSlug(i, chapterPlan.title);
    const file = path.join(baseOut, `ch-${String(i).padStart(2, '0')}-${slugifyPolish(chapterPlan.title)}.md`);

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

    results.push({ index: i, title: chapterPlan.title, path: file, id, slug });
  }

  console.log(`\n📚 Generuję sekcję maturalną jako BLOKI HTML...`);
  const studyBlocks = await generateFinalStudySection(args.workTitle, args.author, chapterSummaries);

  // study-index (pomocniczy komentarz dla frontu)
  const studyIndex = {
    chapters: results.map((r) => ({
      index: r.index,
      id: r.id,
      slug: path.basename(r.path).replace(/\.md$/, ''),
      title: r.title,
    })),
    axes: [] as string[],
  };
  const studyIndexComment = `<!-- study-index: ${JSON.stringify(studyIndex)} -->`;

  // 1) Dopisz TYLKO bloki do GŁÓWNEGO pliku handbooka (bez globalnego inline panelu)
  const appendPayloadForHandbook = [
    `<!-- study-blocks:start -->`,
    studyBlocks.trim(),
    `<!-- study-blocks:end -->`,
    `\n${studyIndexComment}\n`,
  ].join('\n');
  try {
    fs.appendFileSync(args.filePath, appendPayloadForHandbook, 'utf8');
    console.log(`   ✅ Dodano study-blocks do: ${path.basename(args.filePath)}`);
  } catch (e) {
    console.warn(`   ⚠️  Nie udało się dopisać study-blocks do pliku bazowego: ${(e as Error).message}`);
  }

  // 2) ZAPISZ osobny plik _SEKCJA_MATURALNA.md z blokami HTML w katalogu .chapters
  const studySectionPath = path.join(baseOut, '_SEKCJA_MATURALNA.md');
  const studySectionContent = [
    `<!-- study-blocks:start -->`,
    studyBlocks.trim(),
    `<!-- study-blocks:end -->`,
    `\n${studyIndexComment}\n`,
  ].join('\n');
  fs.writeFileSync(studySectionPath, studySectionContent, 'utf8');
  console.log(`   ✅ Sekcja maturalna (HTML) → ${path.basename(studySectionPath)} (dla DB)`);

  return { outDir: baseOut, written: results };
}
