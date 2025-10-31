/// <reference types="node" />
// file: src/index_handbook.ts
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import minimist from 'minimist';
import {
  generateHandbook,
  appendChaptersIndividuallyFromToc,
  parseToc,
} from './generation/handbook';
import {
  findHandbookIdByTitle,
  insertSlHandbook,
  insertSlChapter,
  updateSlChapterContentByOrder,
} from './db/sl_handbooks';

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
  // Uwaga: w regex jest półpauza. To jest w literalnym /.../, więc OK.
  const h1 = fs.readFileSync(mdPath, 'utf8').match(/^#\s+(.+?)\s+—\s+wersja\s+skrócona/i);
  const workTitle = h1 ? h1[1].trim() : 'Nieznany tytuł';
  const dir = path.join(path.dirname(mdPath), path.basename(mdPath).replace(/\.md$/i, '') + '.chapters');
  if (!fs.existsSync(dir)) throw new Error(`Brak katalogu z rozdziałami: ${dir}`);
  return { dir, workTitle, mdPath };
}

/** Seeding: tworzy handbook + rozdziały (tytuł+opis, content=NULL) na podstawie ToC. */
async function ensureHandbookSeeded(mdPath: string, workTitle: string): Promise<string> {
  const md = fs.readFileSync(mdPath, 'utf8');
  const hbTitle = `${workTitle} — wersja skrócona`;

  let handbookId = await findHandbookIdByTitle(hbTitle);
  if (handbookId) return handbookId;

  console.log(`Seed: "${hbTitle}" (tytuły+opisy z ToC, content=NULL)...`);
  const mDesc = md.match(/^#\s+.+?\n+([\s\S]*?)\n+##\s+Spis treści/m);
  const description = (mDesc?.[1] || '').trim();
  const toc = parseToc(md);

  handbookId = await insertSlHandbook({
    title: hbTitle,
    description: description || 'Skrót dzieła.',
  });

  for (let i = 0; i < toc.length; i++) {
    const { title, description } = toc[i];
    await insertSlChapter({ handbookId, title, description, sortOrder: i, ifNotExists: true });
  }
  console.log(`Utworzono handbook + ${toc.length} rozdziałów (content pusty).`);
  return handbookId;
}

async function runGenerate(argv: minimist.ParsedArgs) {
  const work = String(argv.work || '').trim();
  const author = String(argv.author || '').trim();
  const minutes = Number(argv.minutes || 5);
  const minutesPerChapter = Number(argv.minutesPerChapter || 0.5);
  const from = argv.from ? Number(argv.from) : undefined;
  const to = argv.to ? Number(argv.to) : undefined;

  if (!work || !author) {
    console.error('Użycie: yarn handbook --work "Tytuł" --author "Autor" [--minutes 5] [--minutesPerChapter 0.5] [--from N] [--to M]');
    process.exit(1);
  }

  console.log(`Generuję skrót: "${work}" — ${author}`);
  const res = await generateHandbook({ workTitle: work, author, targetMinutes: minutes });
  console.log('Plik główny:', res.markdownPath);

  console.log('Rozdziały -> pliki (orientacja + przejścia, teraźniejszy)...');
  const { outDir, written } = await appendChaptersIndividuallyFromToc({
    filePath: res.markdownPath,
    workTitle: work,
    author,
    targetMinutesPerChapter: minutesPerChapter,
    range: from && to ? { from, to } : (from ? { from, to: from } : undefined),
  });

  console.log('Zapisano w:', outDir);
  for (const w of written) {
    const num = String(w.index).padStart(2, '0');
    console.log(`  • ${num} ${w.title}`);
  }
  console.log('  • Epilog');
}

async function runFinish(argv: minimist.ParsedArgs) {
  const chaptersDirArg = argv.chaptersDir ? String(argv.chaptersDir) : '';
  const workTitleArg = argv.work ? String(argv.work) : '';

  const { dir, workTitle, mdPath } = chaptersDirArg && workTitleArg
    ? { dir: chaptersDirArg, workTitle: workTitleArg, mdPath: findLatestHandbookFile() }
    : findLatestChaptersDir();

  const files = fs.readdirSync(dir).filter(f => /^ch-\d{2}-.*\.md$/.test(f)).sort();
  if (!files.length) {
    console.error(`Brak plików rozdziałów w: ${dir}`);
    process.exit(1);
  }

  const from = argv.from ? Number(argv.from) : 1;
  const to = argv.to ? Number(argv.to) : files.length;

  const hbTitle = `${workTitle} — wersja skrócona`;
  let handbookId = await findHandbookIdByTitle(hbTitle);
  if (!handbookId) handbookId = await ensureHandbookSeeded(mdPath, workTitle);

  console.log(`Push treści do DB: ${hbTitle} (id=${handbookId})`);
  console.log(`Katalog: ${dir} | Zakres: ${from}..${to}`);

  for (let i = from; i <= to; i++) {
    const idx = i - 1;
    const file = files[i - 1];
    const md = fs.readFileSync(path.join(dir, file), 'utf8');
    await updateSlChapterContentByOrder({ handbookId, sortOrder: idx, content: md.trim() });
    console.log(`  • OK: ${file} -> sort_order=${idx}`);
  }

  console.log('Zakończono.');
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
  console.error('Błąd:', err && (err as Error).message ? (err as Error).message : err);
  process.exit(1);
});
