// file: src/index_handbook.ts
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import minimist from 'minimist';

// === GENERATOR: plan → rozdziały → sekcja maturalna (bloki)
import {
  generateHandbook,
  appendChaptersIndividuallyFromToc,
} from './generation/handbook/handbook';
import { NarrativePlan } from './generation/handbook/narrative_planner';

// === DB repo (wydzielone)
import {
  upsertHandbookAscii,
  findHandbookIdByTitleAscii,
  ensureChapterMeta,
  setChapterContentForce,
  updateHandbookChaptersCount,
} from './db/handbooks_repo';

// ==============
// POMOCNICZE I/O
// ==============
function readUtf8(p: string): string {
  return fs.readFileSync(p, 'utf8');
}

function listChapterFiles(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .filter((f) => /^ch-\d+.*\.md$/i.test(f))
    .sort((a, b) => {
      const na = parseInt(a.match(/^ch-(\d+)/i)?.[1] ?? '0', 10);
      const nb = parseInt(b.match(/^ch-(\d+)/i)?.[1] ?? '0', 10);
      return na - nb;
    });
}

function extractTitleAndDescription(md: string): { title: string; description: string } {
  const lines = md.split(/\r?\n/);
  let title = '';
  let description = '';

  const h = lines.find((l) => /^#{1,2}\s+/.test(l.trim()));
  if (h) {
    title = h.replace(/^#{1,2}\s+/, '').trim();
    const idx = lines.indexOf(h);
    const after = lines.slice(idx + 1).find((l) => l.trim().length > 0 && !/^#/.test(l.trim()));
    if (after) description = after.trim();
  } else {
    for (let i = 0; i < Math.min(lines.length, 20); i++) {
      const t = lines[i]?.trim();
      if (!t) continue;
      if (/^\d+/.test(t)) continue;
      if (!title) {
        title = t;
        continue;
      }
      if (!description && t !== title) {
        description = t;
        break;
      }
    }
  }

  if (!title) title = 'Rozdział';
  if (!description) description = 'Opis w przygotowaniu';
  return { title, description };
}

function firstParagraph(md: string): string | undefined {
  return md.split(/\r?\n\r?\n/).find((p) => p.trim().length > 0)?.trim();
}

// =============================
// AUTODETEKCJA KATALOGU ROZDZIAŁÓW
// =============================
function autoDetectLatestChaptersDir(cwd: string): string {
  const dbg = path.join(cwd, 'debug', 'handbooks');
  if (!fs.existsSync(dbg) || !fs.statSync(dbg).isDirectory()) {
    console.error('❌ Nie znaleziono debug/handbooks z katalogami *.chapters');
    process.exit(1);
  }

  const candidates = fs
    .readdirSync(dbg)
    .map((name) => path.join(dbg, name))
    .filter((p) => p.endsWith('.chapters') && fs.existsSync(p) && fs.statSync(p).isDirectory())
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  if (!candidates.length) {
    console.error('❌ Nie ma żadnego katalogu *.chapters w debug/handbooks');
    process.exit(1);
  }

  const chosen = candidates[0];
  console.log(`📁 Używam katalogu rozdziałów: ${chosen}`);
  return chosen;
}

// =============================
// ODCZYT TYTUŁU DZIEŁA
// =============================
function detectWorkTitleFromSiblingHandbookMd(chaptersDir: string): string | null {
  const parent = path.dirname(chaptersDir);
  const mdCandidates = fs
    .readdirSync(parent)
    .filter((f) => /^handbook-.*\.md$/i.test(f))
    .map((f) => path.join(parent, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  for (const p of mdCandidates) {
    const md = readUtf8(p);
    const h1 = md.split(/\r?\n/).find((l) => /^#\s+.+$/.test(l.trim()));
    if (!h1) continue;
    const raw = h1.replace(/^#\s+/, '').trim();
    const m = raw.match(/^(.*)\s+[—-]\s+wersja skrócona$/i);
    if (m && m[1]) return m[1].trim();
  }
  return null;
}

function guessWorkTitleFromDir(chaptersDir: string): string {
  const base = path.basename(chaptersDir).replace(/\.chapters$/, '');
  const guess = base.replace(/^handbook[-_]?/i, '').replace(/-\d{4}-\d{2}-\d{2}t.*$/i, '');
  return guess
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

// ==================
// VALIDACJA (zaktualizowana pod nową strukturę ściągi)
// ==================
function validateChaptersHavePanels(chaptersDir: string): string[] {
  const files = listChapterFiles(chaptersDir);
  const bad: string[] = [];
  for (const f of files) {
    const md = readUtf8(path.join(chaptersDir, f));
    if (!md.includes('<!-- study-refs:panel:start -->')) bad.push(f);
  }
  return bad;
}

/**
 * NOWA walidacja „_SEKCJA_MATURALNA.md”:
 * - wymagamy <study-section>
 * - w środku dwie części: <study-global> oraz <study-per-chapter>
 * - w części per-chapter muszą istnieć bloki z data-chapter="ch-XX"
 * - dodatkowo: dwa globalne bloki: study-characters oraz study-contexts (minimum dla ściągi)
 * - markery <!-- study-blocks:start/end -->
 */
function validateStudySection(chaptersDir: string): string[] {
  const p = path.join(chaptersDir, '_SEKCJA_MATURALNA.md');
  const problems: string[] = [];
  if (!fs.existsSync(p)) {
    problems.push('Brak pliku _SEKCJA_MATURALNA.md');
    return problems;
  }
  const md = readUtf8(p);

  // Markery sekcji (spójność z pipeline)
  if (!md.includes('<!-- study-blocks:start -->') || !md.includes('<!-- study-blocks:end -->')) {
    problems.push('Brak markerów study-blocks:start/end');
  }

  // Opakowanie całości
  if (!/<study-section[\s>]/i.test(md)) problems.push('Brak <study-section>');

  // Dwie części ściągi
  if (!/<study-global[\s>]/i.test(md)) problems.push('Brak <study-global>');
  if (!/<study-per-chapter[\s>]/i.test(md)) problems.push('Brak <study-per-chapter>');

  // Globalne minimum
  if (!/<study-block[^>]+id=["']study-characters["']/i.test(md)) {
    problems.push('Brak bloku globalnego: study-characters');
  }
  if (!/<study-block[^>]+id=["']study-contexts["']/i.test(md)) {
    problems.push('Brak bloku globalnego: study-contexts');
  }

  // Czy istnieją jakiekolwiek bloki per-rozdział
  if (!/data-chapter=["']ch-\d{2}["']/i.test(md)) {
    problems.push('Brak bloków per-rozdział (data-chapter="ch-XX") w <study-per-chapter>');
  }

  return problems;
}

// ==================
// ZAPIS DO DB
// ==================
async function persistHandbookFolderToDb(latestChaptersDir: string, workTitleOverride?: string) {
  const files = listChapterFiles(latestChaptersDir);
  if (files.length === 0) {
    console.error('❌ Brak plików ch-*.md');
    process.exit(1);
  }

  // tytuł dzieła
  const siblingTitle = detectWorkTitleFromSiblingHandbookMd(latestChaptersDir);
  const guessedTitle = guessWorkTitleFromDir(latestChaptersDir);
  const workTitle = (workTitleOverride || siblingTitle || guessedTitle).trim();

  // opis – pierwszy akapit z README albo z pierwszego rozdziału
  let description = 'Skrót dzieła.';
  const readme = path.join(latestChaptersDir, 'README.md');
  if (fs.existsSync(readme)) {
    description = firstParagraph(readUtf8(readme)) ?? description;
  } else {
    const firstFile = path.join(latestChaptersDir, files[0]);
    description = extractTitleAndDescription(readUtf8(firstFile)).description || description;
  }

  const hbTitleAscii = `${workTitle} - wersja skrócona`;

  // handbookId
  let handbookId: string | null = await findHandbookIdByTitleAscii(workTitle);
  if (!handbookId) {
    const { id } = await upsertHandbookAscii({ title: hbTitleAscii, description });
    handbookId = id;
  }
  if (!handbookId) {
    throw new Error('Brak handbookId po upsercie');
  }

  console.log(`\n🗄️  Zapis do DB: ${hbTitleAscii}`);
  console.log(`   ID: ${handbookId}`);
  console.log(`   Katalog: ${latestChaptersDir}`);
  console.log(`   Rozdziały: ${files.length}`);

  // rozdziały
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const md = readUtf8(path.join(latestChaptersDir, file)).trim();
    const meta = extractTitleAndDescription(md);

    const id = await ensureChapterMeta(handbookId, i, meta.title, meta.description);
    await setChapterContentForce(handbookId, i, meta, md);
    console.log(`   ✅ ${file} → id: ${id || '(insert fallback)'}`);
  }

  // sekcja maturalna (ostatni „rozdział”)
  const sekcja = path.join(latestChaptersDir, '_SEKCJA_MATURALNA.md');
  let totalCount = files.length;
  if (fs.existsSync(sekcja)) {
    const md = readUtf8(sekcja).trim();
    const sortOrder = files.length; // po wszystkich rozdziałach
    const meta = {
      title: 'Sekcja maturalna',
      description: 'Ściągawka: część globalna + bloki per rozdział (data-chapter="ch-XX").',
    };
    const id = await ensureChapterMeta(handbookId, sortOrder, meta.title, meta.description);
    await setChapterContentForce(handbookId, sortOrder, meta, md);
    console.log(`   ✅ _SEKCJA_MATURALNA.md → id: ${id || '(insert fallback)'}`);
    totalCount += 1;
  }

  await updateHandbookChaptersCount(handbookId, totalCount);
  console.log(`📚 Zaktualizowano chapters_count → ${totalCount}`);

  console.log(`\n✅ Wszystkie rozdziały + sekcja maturalna zapisane.`);
}

// ==================
// GŁÓWNY PRZEBIEG
// ==================
async function runFullPipeline(opts: {
  work: string;
  author: string;
  targetMinutes?: number;
  desiredChapters?: number;
  rangeFrom?: number;
  rangeTo?: number;
  validate?: boolean;
}) {
  // 1) Plan + wstęp + ToC
  const { markdownPath, narrativePlan } = await generateHandbook({
    workTitle: opts.work,
    author: opts.author,
    targetMinutes: opts.targetMinutes ?? 5,
    desiredChapters: opts.desiredChapters ?? 12,
  });

  // 2) Rozdziały + Sekcja maturalna → zapis .chapters/*
  const { outDir } = await appendChaptersIndividuallyFromToc({
    filePath: markdownPath,
    workTitle: opts.work,
    author: opts.author,
    targetMinutesPerChapter: opts.targetMinutes ?? 5,
    narrativePlan: narrativePlan as NarrativePlan,
    range: opts.rangeFrom || opts.rangeTo ? { from: opts.rangeFrom ?? 1, to: opts.rangeTo ?? (narrativePlan.chapters.length) } : undefined,
  });

  // 3) (opcjonalnie) walidacja artefaktów (dostosowana do nowej struktury ściągi)
  if (opts.validate) {
    const missingPanels = validateChaptersHavePanels(outDir);
    const studyProblems = validateStudySection(outDir);
    if (missingPanels.length) {
      console.warn(`⚠️ Rozdziały bez panelu odnośników: ${missingPanels.join(', ')}`);
    }
    if (studyProblems.length) {
      console.warn(`⚠️ Problemy z _SEKCJA_MATURALNA.md:\n- ${studyProblems.join('\n- ')}`);
    }
  }

  // 4) Zrzut do DB
  await persistHandbookFolderToDb(outDir, opts.work);
}

async function main() {
  const argv = minimist(process.argv.slice(2));
  const wantFinishOnly = !!argv.finish;

  // Informacyjne: legacy flagi (nie wpływają na flow)
  if (typeof argv.studyNotes !== 'undefined') {
    console.log(`ℹ️  --studyNotes=${argv.studyNotes} (zignorowane w nowym flow ściągi)`);
  }
  if (typeof argv.analysis !== 'undefined') {
    console.log(`ℹ️  --analysis=${argv.analysis} (zignorowane; ściąga ma własne bloki HTML)`);
  }

  if (wantFinishOnly) {
    const dir = autoDetectLatestChaptersDir(process.cwd());
    await persistHandbookFolderToDb(dir, argv.work);
    return;
  }

  // Tryb „pełny”
  const work = String(argv.work || '').trim();
  const author = String(argv.author || '').trim();

  if (!work || !author) {
    console.error('Użycie: yarn handbook --work "Tytuł" --author "Autor" [--targetMinutes 5] [--desiredChapters 12] [--rangeFrom 1 --rangeTo 12] [--validate]');
    console.error('Albo:  yarn handbook --finish   (tylko indeksowanie najnowszego katalogu .chapters do DB)');
    process.exit(1);
  }

  await runFullPipeline({
    work,
    author,
    targetMinutes: argv.targetMinutes ? Number(argv.targetMinutes) : undefined,
    desiredChapters: argv.desiredChapters ? Number(argv.desiredChapters) : undefined,
    rangeFrom: argv.rangeFrom ? Number(argv.rangeFrom) : undefined,
    rangeTo: argv.rangeTo ? Number(argv.rangeTo) : undefined,
    validate: !!argv.validate,
  });
}

main();
