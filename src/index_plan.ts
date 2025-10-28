// file: src/index_plan.ts
import process from 'node:process';
import chalk from 'chalk';
import { fetchTopicWithContext } from './db/supabase';
import { generateScaledPlan } from './pipeline/plan_generate';

const noColor = process.argv.includes('--no-color') || !!process.env.NO_COLOR;
if (noColor) (chalk as any).level = 0;

async function main() {
  const topicId = process.argv.slice(2).find(a => !a.startsWith('-') && !a.includes('='));
  if (!topicId) {
    console.error(chalk.red('❌ Podaj topicId: npm run plan -- <topicId>'));
    process.exit(1);
  }

  console.log(chalk.bold(`\n[BOOT] plan pid=${process.pid} node=${process.version}`));
  console.log(chalk.cyan(`ℹ️  topicId=${topicId}`));

  try {
    const ctx = await fetchTopicWithContext(topicId);
    console.log(chalk.gray(`Kontekst: [Przedmiot=${ctx.subjectName || '-'}] [Sekcja=${ctx.sectionTitle}] [Temat=${ctx.topicTitle}]`));

    const plan = await generateScaledPlan({
      subjectName: ctx.subjectName,
      sectionTitle: ctx.sectionTitle,
      topicTitle: ctx.topicTitle,
      topicDescription: ctx.topicDescription,
    });

    // Prosty podgląd w konsoli
    const byDepth = new Map<number, string[]>();
    for (const n of plan.nodes) {
      const arr = byDepth.get(n.depth) || [];
      arr.push(`${n.id} ${chalk.bold(n.title)} ${chalk.gray(`[${n.kind || 'core'}]`)}`);
      byDepth.set(n.depth, arr);
    }

    console.log(chalk.green('\n✅ Plan wygenerowany (warstwy):'));
    const depths = [...byDepth.keys()].sort((a,b) => a-b);
    for (const d of depths) {
      console.log(chalk.yellow(`\n  depth=${d}`));
      for (const line of byDepth.get(d)!) console.log('   • ' + line);
    }

    console.log(chalk.gray('\n(Plik debug zapisany w ./debug/plan-*.json)'));
  } catch (e: any) {
    console.error(chalk.red('💥 Błąd:'), e?.message || e);
    if (e?.stack) console.error(chalk.gray(e.stack));
    process.exit(1);
  }
}

main();
