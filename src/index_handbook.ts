// file: src/index_handbook.ts
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import minimist from 'minimist';
import { generateHandbook, appendChaptersIndividuallyFromToc } from './generation/handbook';
import { findHandbookIdByTitle, updateSlChapterContentByOrder } from './db/sl_handbooks';

function findLatestHandbookFile(): string {
  const dir = path.join('debug', 'handbooks');
  if (!fs.existsSync(dir)) throw new Error(`Nie znaleziono katalogu: ${dir}`);
  const files = fs.readdirSync(dir)
    .filter(f => f.startsWith('handbook-') && f.endsWith('.md') && !f.endsWith('.chapters.md'))
    .map(f => path.join(dir, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  if (!files.length) throw new Error('Brak plików handbook-*.md.');
  return files[0];
}

function findLatestChaptersDir() {
  const mdPath = findLatestHandbookFile();
  const m = fs.readFileSync(mdPath, 'utf8').match(/^#\s+(.+?)\s+—\s+wersja\s+skrócona/i);
  const workTitle = m ? m[1].trim() : 'Nieznany tytuł';
  const dir = path.join(path.dirname(mdPath), path.basename(mdPath).replace(/\.md$/i, '') + '.chapters');
  if (!fs.existsSync(dir)) throw new Error(`Brak katalogu z rozdziałami: ${dir}`);
  return { dir, workTitle, mdPath };
}

async function runGenerate(argv: minimist.ParsedArgs) {
  const work = String(argv.work || '').trim();
  const author = String(argv.author || '').trim();
  const minutes = Number(argv.minutes || 5);
  const minutesPerChapter = Number(argv.minutesPerChapter || 0.5);
  const rangeFrom = argv.from ? Number(argv.from) : undefined;
  const rangeTo = argv.to ? Number(argv.to) : undefined;

  if (!work || !author) {
    console.error('❌ Użycie: yarn handbook --work "Tytuł" --author "Autor" [--minutes 5] [--minutesPerChapter 0.5] [--from N] [--to M]');
    process.exit(1);
  }

  console.log(`📘 Generuję skrót: "${work}" — ${author}`);
  const res = await generateHandbook({ workTitle: work, author, targetMinutes: minutes });
  console.log('📄 Plik główny:', res.markdownPath);

  console.log('🧱 Generuję rozdziały (plikowo, bez DB)…');
  const { outDir, written } = await appendChaptersIndividuallyFromToc({
    filePath: res.markdownPath,
    workTitle: work,
    author,
    targetMinutesPerChapter: minutesPerChapter,
    range: rangeFrom && rangeTo ? { from: rangeFrom, to: rangeTo }
          : rangeFrom ? { from: rangeFrom, to: rangeFrom }
          : undefined,
  });

  console.log('✅ Rozdziały zapisane do katalogu:', outDir);
  for (const w of written) console.log(`  • ${String(w.index).padStart(2, '0')} ${w.title}`);
  console.log('  • Epilog');
}

async function runFinish(argv: minimist.ParsedArgs) {
  const chaptersDirArg = argv.chaptersDir ? String(argv.chaptersDir) : '';
  const workTitleArg = argv.work ? String(argv.work) : '';

  const { dir, workTitle } = chaptersDirArg && workTitleArg
    ? { dir: chaptersDirArg, workTitle: workTitleArg }
    : findLatestChaptersDir();

  const files = fs.readdirSync(dir).filter(f => /^ch-\d{2}-.*\.md$/.test(f)).sort();
  if (!files.length) {
    console.error(`❌ Brak plików rozdziałów w: ${dir}`);
    process.exit(1);
  }

  const from = argv.from ? Number(argv.from) : 1;
  const to = argv.to ? Number(argv.to) : files.length;

  const hbTitle = `${workTitle} — wersja skrócona`;
  const handbookId = await findHandbookIdByTitle(hbTitle);
  if (!handbookId) {
    console.error(`❌ Nie znaleziono w DB handbooka o tytule: "${hbTitle}"`);
    console.error('   → najpierw załóż handbook i rozdziały (tytuły) w DB swoim procesem.');
    process.exit(1);
  }

  console.log(`🗂️  Push treści do DB: ${hbTitle} (id=${handbookId})`);
  console.log(`📁 Z katalogu: ${dir}`);
  console.log(`🔢 Zakres: ${from}..${to}`);

  for (let i = from; i <= to; i++) {
    const idx = i - 1; // sort_order 0-based
    const file = files[i - 1];
    const full = path.join(dir, file);
    const md = fs.readFileSync(full, 'utf8');

    await updateSlChapterContentByOrder({
      handbookId,
      sortOrder: idx,
      content: md.trim(),
    });

    console.log(`  • OK: ${file}  → sort_order=${idx}`);
  }

  console.log('✅ Zakończono.');
}

async function main() {
  const argv = minimist(process.argv.slice(2), {
    boolean: ['finish'],
    string: ['work', 'author', 'minutes', 'minutesPerChapter', 'from', 'to', 'chaptersDir'],
    alias: { finish: 'f' },
  });

  if (argv.finish) await runFinish(argv);
  else await runGenerate(argv);
}

main().catch(err => {
  console.error('❌ Błąd:', err.message || err);
  process.exit(1);
});
