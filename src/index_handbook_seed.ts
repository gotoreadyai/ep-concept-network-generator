// file: src/index_handbook_seed.ts
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { parseToc } from './generation/handbook';
import { findHandbookIdByTitle, insertSlHandbook, insertSlChapter } from './db/sl_handbooks';

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

async function main() {
  const mdPath = findLatestHandbookFile();
  const md = fs.readFileSync(mdPath, 'utf8');

  const h1 = md.match(/^#\s+(.+?)\s+—\s+wersja\s+skrócona/i);
  const workTitle = h1 ? h1[1].trim() : 'Nieznany tytuł';
  const hbTitle = `${workTitle} — wersja skrócona`;

  const mDesc = md.match(/^#\s+.+?\n+([\s\S]*?)\n+##\s+Spis treści/m);
  const description = (mDesc?.[1] || '').trim();

  const toc = parseToc(md);
  if (!toc.length) throw new Error('Brak spisu treści do zasiania w DB.');

  let handbookId = await findHandbookIdByTitle(hbTitle);
  if (handbookId) {
    console.log(`ℹ️  Handbook już istnieje: "${hbTitle}" (id=${handbookId}) — pomijam tworzenie.`);
  } else {
    handbookId = await insertSlHandbook({
      title: hbTitle,
      description: description || `Skrót dzieła.`,
    });
    console.log(`✅ Utworzono handbook: "${hbTitle}" (id=${handbookId})`);
  }

  // Zasiejamy rozdziały wg ToC, sort_order = 0..n-1 (idempotentnie po tytule w ramach handbooka)
  let added = 0;
  for (let i = 0; i < toc.length; i++) {
    const { title, description } = toc[i];
    const created = await insertSlChapter({ handbookId, title, description, sortOrder: i, ifNotExists: true });
    if (created) added++;
  }
  console.log(`✅ Rozdziały: dodano ${added}/${toc.length} (reszta istniała).`);
}

main().catch(err => {
  console.error('❌ Błąd seedowania:', err.message || err);
  process.exit(1);
});
