// file: src/index_concepts.ts
import process from 'node:process';
import chalk from 'chalk';
import fs from 'node:fs';
import path from 'node:path';
import { fetchTopicWithContext, insertConceptPage } from './db/supabase';
import { addEdge } from './db/edges';
import { expandConceptMarkdown, getConceptVariantName } from './generation/concepts';
import { Plan } from './types/plan';

const noColor = process.argv.includes('--no-color') || !!process.env.NO_COLOR;
if (noColor) (chalk as any).level = 0;

function slug(s: string) {
  return (s || '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]+/g, '')
    .slice(0, 60) || 'topic';
}

function findPlanFileForTopic(topicTitle: string): string {
  const expected = path.join('debug', `plan-${slug(topicTitle)}.json`);
  if (fs.existsSync(expected)) return expected;

  // Fallback: najnowszy plan-*.json
  const dir = 'debug';
  if (!fs.existsSync(dir)) throw new Error(`Brak katalogu ${dir}`);
  const candidates = fs
    .readdirSync(dir)
    .filter(f => /^plan-.*\.json$/.test(f))
    .map(f => path.join(dir, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  if (!candidates.length) throw new Error('Nie znaleziono plików plan-*.json w ./debug');
  return candidates[0];
}

function normalizeSkills(sk: Plan['nodes'][number]['skills']): string[] {
  if (Array.isArray(sk)) return sk.map(s => String(s).trim()).filter(Boolean);
  if (typeof sk === 'string') {
    return sk.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
}

async function main() {
  const topicId = process.argv.slice(2).find(a => !a.startsWith('-') && !a.includes('='));
  if (!topicId) {
    console.error(chalk.red('❌ Podaj topicId: tsx src/index_concepts.ts <topicId>'));
    process.exit(1);
  }

  console.log(chalk.bold(`\n[BOOT] concepts pid=${process.pid} node=${process.version}`));
  console.log(chalk.cyan(`ℹ️  topicId=${topicId}`));

  try {
    const ctx = await fetchTopicWithContext(topicId);
    console.log(chalk.gray(`Kontekst: [Przedmiot=${ctx.subjectName || '-'}] [Sekcja=${ctx.sectionTitle}] [Temat=${ctx.topicTitle}]`));

    const planPath = findPlanFileForTopic(ctx.topicTitle);
    const plan: Plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
    console.log(chalk.gray(`🧭 Plan: ${planPath} (nodes=${plan.nodes.length}, edges=${plan.edges.length})`));

    // 1) Strony konceptów
    const idToPageId = new Map<string, string>();
    for (const n of plan.nodes) {
      const variant = getConceptVariantName(n.title);
      const md = await expandConceptMarkdown(n.title, {
        subjectName: ctx.subjectName,
        sectionTitle: ctx.sectionTitle,
        sectionDescription: ctx.sectionDescription,
        topicTitle: ctx.topicTitle,
        topicDescription: ctx.topicDescription,
      });

      const skills = normalizeSkills(n.skills);
      const tags = [
        `concept.kind:${n.kind || 'core'}`,
        `concept.variant:${variant}`,
        ...skills.map(s => `skill:${s}`),
      ];

      const pageId = await insertConceptPage({
        topicId,
        title: n.title,
        markdown: md,
        tags,
      });

      idToPageId.set(n.id, pageId);
      console.log(chalk.green(`✅ concept: ${n.id} → page ${pageId} (${n.title})`));
    }

    // 2) Krawędzie między stronami wg planu
    const allowed = new Set(['prereq', 'extends', 'example', 'contrast']);
    for (const e of plan.edges) {
      if (!allowed.has(e.type)) continue;
      const fromPage = idToPageId.get(e.from);
      const toPage = idToPageId.get(e.to);
      if (!fromPage || !toPage) {
        console.log(chalk.yellow(`⚠️ pominięto edge ${e.from}→${e.to} (${e.type}) – brak pageId`));
        continue;
      }
      try {
        await addEdge({ source: fromPage, target: toPage, type: e.type as any });
        console.log(chalk.gray(`↪︎ edge ${e.type}: ${fromPage} → ${toPage}`));
      } catch (err: any) {
        console.log(chalk.yellow(`⚠️ edge skip: ${err?.message || err}`));
      }
    }

    console.log(chalk.green('\n🎯 Gotowe: koncepty i krawędzie zapisane w Supabase.'));
    console.log(chalk.gray('Tip: teraz uruchom „yarn sources -- <topicId>”, by dodać stronę Źródła + autolinki.'));
  } catch (e: any) {
    console.error(chalk.red('💥 Błąd:'), e?.message || e);
    if (e?.stack) console.error(chalk.gray(e.stack));
    process.exit(1);
  }
}

main();
