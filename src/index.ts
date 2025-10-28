// file: src/index.ts
import process from 'node:process';
import chalk from 'chalk';
import { fetchTopicWithContext, insertConceptPage } from './db/supabase';
import { proposeConceptTitles, expandConceptMarkdown, conceptMarkdownFromTitle } from './generation/concepts';
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
    console.error(chalk.red('❌ Podaj topicId: npm start -- <topicId> [--count 5]'));
    process.exit(1);
  }

  const count = Number(getFlag('--count', process.env.CONCEPT_COUNT || '5')) || 5;

  console.log(chalk.bold(`\n[BOOT] gen pid=${process.pid} node=${process.version}`));
  console.log(chalk.cyan(`ℹ️  topicId=${topicId}  count=${count}`));

  try {
    const ctx = await fetchTopicWithContext(topicId);
    console.log(chalk.gray(`Kontekst: [Przedmiot=${ctx.subjectName || '-'}] [Sekcja=${ctx.sectionTitle}] [Temat=${ctx.topicTitle}]`));

    // 1) Propozycje tytułów (JSON array)
    const titles = await proposeConceptTitles({
      subjectName: ctx.subjectName,
      sectionTitle: ctx.sectionTitle,
      topicTitle: ctx.topicTitle,
      topicDescription: ctx.topicDescription,
      count
    });

    let saved = 0;
    for (const t of titles) {
      // 2) Wariant minimalny (fallback lokalny)…
      let md = conceptMarkdownFromTitle(String(t), {
        subjectName: ctx.subjectName,
        sectionTitle: ctx.sectionTitle,
        sectionDescription: ctx.sectionDescription,
        topicTitle: ctx.topicTitle,
        topicDescription: ctx.topicDescription,
      });
      // …a następnie 3) rozszerzenie przez LLM (zachowuje format)
      try {
        md = await expandConceptMarkdown(String(t), {
          subjectName: ctx.subjectName,
          sectionTitle: ctx.sectionTitle,
          sectionDescription: ctx.sectionDescription,
          topicTitle: ctx.topicTitle,
          topicDescription: ctx.topicDescription,
        });
      } catch {
        // jeśli LLM zawiedzie – zostaje minimalny wariant
      }

      const title = extractH1Title(md);
      await insertConceptPage({ topicId, title, markdown: md });
      saved++;
      console.log(chalk.green(`✅ Zapisano koncept: "${title}"`));
    }

    console.log(chalk.green(`\n🎯 Gotowe. Zapisano ${saved}/${titles.length} konceptów.`));
  } catch (e: any) {
    console.error(chalk.red('💥 Błąd:'), e?.message || e);
    if (e?.stack) console.error(chalk.gray(e.stack));
    process.exit(1);
  }
}

main();
