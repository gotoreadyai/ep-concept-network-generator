// file: src/index_handbook.ts
/// <reference types="node" />
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import minimist from 'minimist';
import {
  generateHandbook,
  appendChaptersIndividuallyFromToc,
  parseToc,
  HandbookResult,
} from './generation/handbook/handbook';
import {
  findHandbookIdByTitle,
  insertSlHandbook,
  insertSlChapter,
  updateSlChapterContentByOrder,
} from './db/sl_handbooks';
import { generateAnalysisPack } from './generation/handbook/analysis_pack';
import { NarrativePlan } from './generation/handbook/narrative_planner';

function findLatestHandbookFile(): string {
  const dir = path.join('debug', 'handbooks');
  if (!fs.existsSync(dir)) throw new Error(`Nie znaleziono katalogu: ${dir}`);
  const files = fs
    .readdirSync(dir)
    .filter(
      (f) =>
        f.startsWith('handbook-') &&
        f.endsWith('.md') &&
        !f.endsWith('.chapters.md') &&
        // ✅ nie bierzemy pakietów analitycznych jako bazowego handbooka
        !f.includes('.analysis.')
    )
    .map((f) => path.join(dir, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  if (!files.length) throw new Error('Brak plików handbook-*.md.');
  return files[0];
}

function findLatestChaptersDir() {
  const mdPath = findLatestHandbookFile();
  const h1 = fs.readFileSync(mdPath, 'utf8').match(/^#\s+(.+?)\s+[—-]\s+wersja\s+skrócona/i);
  const workTitle = h1 ? h1[1].trim() : 'Nieznany tytuł';
  const dir = path.join(path.dirname(mdPath), path.basename(mdPath).replace(/\.md$/i, '') + '.chapters');
  if (!fs.existsSync(dir)) throw new Error(`Brak katalogu z rozdziałami: ${dir}`);
  return { dir, workTitle, mdPath };
}

function loadNarrativePlan(mdPath: string): NarrativePlan | undefined {
  const planPath = mdPath.replace(/\.md$/, '.plan.json');
  if (fs.existsSync(planPath)) {
    console.log(`📋 Wczytano plan: ${path.basename(planPath)}`);
    return JSON.parse(fs.readFileSync(planPath, 'utf8')) as NarrativePlan;
  }
  console.warn(`⚠️  Brak planu: ${planPath}`);
  return undefined;
}

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
  const minutesPerChapter = Number(argv.minutesPerChapter || 5.0); // Zwiększone z 1.0 do 5.0
  const force = String(argv.force || 'false') === 'true';
  const analysis = argv.analysis === undefined ? false : String(argv.analysis) !== 'false';

  const from = argv.from ? Number(argv.from) : undefined;
  const to = argv.to ? Number(argv.to) : undefined;

  if (!work || !author) {
    console.error(
      'Użycie: yarn handbook --work "Tytuł" --author "Autor" [--minutes 5] [--minutesPerChapter 5.0] [--from N] [--to M] [--analysis true|false] [--force true|false]'
    );
    process.exit(1);
  }

  console.log(`\n╔═══════════════════════════════════════════════════════════════╗`);
  console.log(`║  🎭 GENERATOR IMMERSYJNYCH SKRÓTÓW LEKTUR                    ║`);
  console.log(`╚═══════════════════════════════════════════════════════════════╝`);
  console.log(`\n📖 Dzieło: "${work}" — ${author}`);
  console.log(`⏱️  Cel: ${minutes} min (ToC) + ${minutesPerChapter} min/rozdział`);
  console.log(``);

  console.log(`🎭 Faza 1/3: Planowanie struktury narracyjnej...`);
  console.log(`   (AI wybiera: voice, style, typy rozdziałów)`);

  const res: HandbookResult = await generateHandbook({ workTitle: work, author, targetMinutes: minutes });

  console.log(`\n✅ Faza 1 zakończona:`);
  console.log(`   📄 TOC: ${path.basename(res.markdownPath)}`);
  console.log(`   📋 Plan: ${path.basename(res.markdownPath.replace(/\.md$/, '.plan.json'))}`);
  console.log(`   🎭 Voice: ${res.narrativePlan.narrativeVoice}`);
  console.log(`   ✍️  Style: ${res.narrativePlan.styleInspiration}`);
  console.log(`   🎵 Tone: ${res.narrativePlan.overallTone}`);

  const typeCounts = res.narrativePlan.chapters.reduce((acc, ch) => {
    acc[ch.type] = (acc[ch.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  console.log(`   📚 Mix typów:`, typeCounts);

  console.log(`\n✍️  Faza 2/3: Generowanie rozdziałów z emocjami...`);
  console.log(`   (70% dialogu, gesty, cisze, napięcia)`);

  const { outDir, written } = await appendChaptersIndividuallyFromToc({
    filePath: res.markdownPath,
    workTitle: work,
    author,
    targetMinutesPerChapter: minutesPerChapter,
    narrativePlan: res.narrativePlan,
    range: from && to ? { from, to } : from ? { from, to: from } : undefined,
    force,
  });

  console.log(`\n✅ Faza 2 zakończona:`);
  console.log(`   📁 Katalog: ${outDir}`);
  console.log(`   📖 Rozdziały:`);
  for (const w of written) {
    const num = String(w.index).padStart(2, '0');
    const plan = res.narrativePlan.chapters[w.index - 1];
    const typeEmoji = {
      scene: '🎬',
      diary: '📓',
      letter: '✉️',
      monologue: '💭',
      newspaper: '📰',
      found_document: '📄',
    }[plan.type] || '📝';
    console.log(`      ${typeEmoji} ${num}. ${w.title} [${plan.type}]`);
  }
  console.log(`      🎓 _SEKCJA_MATURALNA.md`);

  if (analysis) {
    console.log(`\n📊 Faza 3/3: Pakiet maturalny (analiza zbiorcza)...`);
    const tocMd = fs.readFileSync(res.markdownPath, 'utf8');
    const toc = parseToc(tocMd).map((t, i) => ({ index: i + 1, title: t.title, description: t.description }));
    const packPath = await generateAnalysisPack({
      workTitle: work,
      author,
      toc,
      chaptersDir: outDir,
      outDir: path.dirname(res.markdownPath),
    });
    console.log(`✅ Pakiet: ${path.basename(packPath)}`);
  }

  console.log(`\n╔═══════════════════════════════════════════════════════════════╗`);
  console.log(`║  🎉 GOTOWE! Skrót z emocjami wygenerowany.                   ║`);
  console.log(`╚═══════════════════════════════════════════════════════════════╝\n`);
}

async function runFinish(argv: minimist.ParsedArgs) {
  const chaptersDirArg = argv.chaptersDir ? String(argv.chaptersDir) : '';
  const workTitleArg = argv.work ? String(argv.work) : '';
  const noSekcjaMaturalna = !!argv.noSekcjaMaturalna;

  // ✅ Jeśli użytkownik podał katalog rozdziałów i tytuł dzieła,
  //    NIE próbujemy wykrywać „najnowszego” handbooka, tylko korzystamy z danych wejściowych.
  const picked =
    chaptersDirArg && workTitleArg
      ? {
          dir: chaptersDirArg,
          workTitle: workTitleArg,
          mdPath: chaptersDirArg.replace(/\.chapters$/, ''),
        }
      : findLatestChaptersDir();

  const { dir, workTitle, mdPath } = picked;

  const files = fs
    .readdirSync(dir)
    .filter((f) => /^ch-\d{2}-.*\.md$/.test(f))
    .sort();
  if (!files.length) {
    console.error(`Brak plików rozdziałów w: ${dir}`);
    process.exit(1);
  }

  const from = argv.from ? Number(argv.from) : 1;
  const to = argv.to ? Number(argv.to) : files.length;

  const hbTitle = `${workTitle} — wersja skrócona`;
  let handbookId = await findHandbookIdByTitle(hbTitle);
  if (!handbookId) handbookId = await ensureHandbookSeeded(mdPath, workTitle);

  console.log(`\n🗄️  Push treści do DB: ${hbTitle}`);
  console.log(`   ID: ${handbookId}`);
  console.log(`   Zakres: ${from}-${to}`);

  for (let i = from; i <= to; i++) {
    const idx = i - 1;
    const file = files[i - 1];
    const md = fs.readFileSync(path.join(dir, file), 'utf8');
    await updateSlChapterContentByOrder({ handbookId, sortOrder: idx, content: md.trim() });
    console.log(`   ✅ ${file}`);
  }

  const sekcjaPath = path.join(dir, '_SEKCJA_MATURALNA.md');
  if (!noSekcjaMaturalna && fs.existsSync(sekcjaPath)) {
    const sekcjaMd = fs.readFileSync(sekcjaPath, 'utf8').trim();
    await insertSlChapter({
      handbookId,
      title: 'Sekcja maturalna',
      description: 'Tezy, motywy, cytaty i pytania egzaminacyjne',
      sortOrder: files.length,
      ifNotExists: true,
    });
    await updateSlChapterContentByOrder({ handbookId, sortOrder: files.length, content: sekcjaMd });
    console.log(`   ✅ _SEKCJA_MATURALNA.md`);
  }

  console.log(`\n✅ Zakończono push do DB.`);
}

async function main() {
  const argv = minimist(process.argv.slice(2), {
    boolean: ['finish', 'noSekcjaMaturalna'],
    string: ['work', 'author', 'minutes', 'minutesPerChapter', 'from', 'to', 'chaptersDir', 'analysis', 'force'],
    alias: { finish: 'f' },
  });

  if (argv.finish) await runFinish(argv);
  else await runGenerate(argv);
}

main().catch((err) => {
  console.error('\n❌ Błąd:', err && (err as Error).message ? (err as Error).message : err);
  process.exit(1);
});
