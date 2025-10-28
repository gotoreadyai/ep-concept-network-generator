// file: src/index_sources.ts
import process from 'node:process';
import chalk from 'chalk';
import { fetchTopicWithContext, fetchConceptPages, insertSourceMaterialPage } from './db/supabase';
import { fetchSourcesAsMarkdown, saveSourcesDebugMarkdown } from './generation/sources';
import { addEdge } from './db/edges';
import { extractH1Title } from './util/markdown';

const noColor = process.argv.includes('--no-color') || !!process.env.NO_COLOR;
if (noColor) (chalk as any).level = 0;

function getFlag(name: string, fallback?: string): string | undefined {
  const idx = process.argv.findIndex(a => a === name);
  if (idx >= 0) return process.argv[idx + 1];
  const kv = process.argv.find(a => a.startsWith(name + '='));
  return kv ? kv.split('=').slice(1).join('=') : fallback;
}

async function main() {
  const topicId = process.argv.slice(2).find(a => !a.startsWith('-') && !a.includes('='));
  if (!topicId) {
    console.error(chalk.red('❌ Podaj topicId: npm run sources -- <topicId> [--count 8]'));
    process.exit(1);
  }
  const count = Number(getFlag('--count', process.env.SOURCES_COUNT || '8')) || 8;

  console.log(chalk.bold(`\n[BOOT] sources pid=${process.pid} node=${process.version}`));
  console.log(chalk.cyan(`ℹ️  topicId=${topicId}  count=${count}`));

  try {
    const ctx = await fetchTopicWithContext(topicId);
    console.log(chalk.gray(`Kontekst: [Przedmiot=${ctx.subjectName || '-'}] [Sekcja=${ctx.sectionTitle}] [Temat=${ctx.topicTitle}]`));

    const conceptPages = await fetchConceptPages(topicId);
    const conceptTitles = conceptPages.map(p => p.title).filter(Boolean);

    const md = await fetchSourcesAsMarkdown({
      subjectName: ctx.subjectName,
      sectionTitle: ctx.sectionTitle,
      topicTitle: ctx.topicTitle,
      topicDescription: ctx.topicDescription,
      conceptTitles,
      count
    });

    const debugPath = saveSourcesDebugMarkdown(ctx.topicTitle, md);
    console.log(chalk.gray(`🗂️  Debug MD: ${debugPath}`));

    // Tytuł pobieramy z H1, a jeśli brak – fallback
    let title: string;
    try { title = extractH1Title(md); }
    catch { title = `Źródła do: ${ctx.topicTitle}`; }

    const sourcePageId = await insertSourceMaterialPage({ topicId, title, markdown: md, forTopicTitle: ctx.topicTitle });
    console.log(chalk.green(`✅ Utworzono stronę source_material dla tematu "${ctx.topicTitle}"`));

    // --- AUTOLINK: źródła → koncepty jako 'example' ---
    for (const cp of conceptPages) {
      try {
        await addEdge({ source: sourcePageId, target: cp.id, type: 'example' });
        console.log(chalk.gray(`↪︎ edge example: ${sourcePageId} → ${cp.id}`));
      } catch (e: any) {
        console.log(chalk.yellow(`⚠️ edge skip: ${e?.message || e}`));
      }
    }

    console.log(chalk.green(`🎯 Gotowe.`));
  } catch (e: any) {
    console.error(chalk.red('💥 Błąd:'), e?.message || e);
    if (e?.stack) console.error(chalk.gray(e.stack));
    process.exit(1);
  }
}

main();
