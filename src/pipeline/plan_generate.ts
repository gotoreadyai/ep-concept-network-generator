// file: src/pipeline/plan_generate.ts
import { generateJson } from '../llm';
import { Plan } from '../types/plan';
import { validatePlan, savePlanDebug } from './plan';
import { computeDepth } from './depth_from_edges';
import { computeScaleSpec } from './plan_scale';

export type PlanContext = {
  subjectName: string;
  sectionTitle: string;
  topicTitle: string;
  topicDescription: string;
};

/** Generuje plan i wylicza depth. Bez parsowania treści błędu jako JSON. */
export async function generateScaledPlan(ctx: PlanContext): Promise<Plan> {
  const scale = computeScaleSpec(ctx.topicTitle, ctx.topicDescription);

  const hardRules = [
    `Wygeneruj WYŁĄCZNIE JSON (bez komentarzy, bez code fence'ów).`,
    `Struktura: {"nodes":[{id,title,skills?,kind?,depth}], "edges":[{from,to,type}]}.`,
    `Pola "depth" NIE wypełniaj — zostanie policzone programowo.`,
    `Liczba węzłów: min ${scale.minNodes}, max ${scale.maxNodes}, cel ${scale.targetNodes}.`,
    `Rozkład ról (przybliżony): core ≈ ${Math.round(scale.distribution.core * 100)}%, bridge ≈ ${Math.round(scale.distribution.bridge * 100)}%, application ≈ ${Math.round(scale.distribution.application * 100)}%.`,
    `Krawędzie porządkujące tylko: "prereq" i "extends".`,
    `Zakaz cykli w grafie dla krawędzi "prereq"+"extends".`,
    `Max ${scale.maxPrereqsPerNode} krawędzie "prereq" wchodzące do jednego węzła.`,
    `Każdy węzeł ma przynajmniej 1 krawędź (jeśli nie porządkująca, to "example" lub "contrast").`,
    `Format id: "k" + numer (np. "k1").`,
    `Tytuł: 4–7 słów, kąt interpretacyjny (nie słowo-parasol).`,
    `skills: 2–4 krótkie frazy (CSV), opcjonalne.`,
    `kind ∈ {"core","bridge","application"}; jeśli niejasne — "core".`,
    `Dla „małych” tematów — płytsze warstwy i mniej "bridge".`,
    `Dla „dużych” tematów — głębsze warstwy, więcej "bridge" i "application".`,
  ].join('\n- ');

  const coverageHint =
    `Zadbaj o pokrycie: definicje → kontekst → procesy → skutki → interpretacje; ` +
    `bridge łączą wątki, application to zastosowania/case'y.`;

  const prompt =
    `Kontekst: Przedmiot=${ctx.subjectName}; Sekcja=${ctx.sectionTitle}; Temat=${ctx.topicTitle}; OpisTematu=${ctx.topicDescription}\n` +
    `Chcę szkic planu jako graf.\n` +
    `- ${hardRules}\n` +
    `- ${coverageHint}\n`;

  const raw = await generateJson<any>(prompt);

  const plan: Plan = { nodes: raw?.nodes || [], edges: raw?.edges || [] };
  validatePlan(plan);

  let withDepth = computeDepth(plan);

  const scaleMax = scale.maxNodes;
  if (withDepth.nodes.length > scaleMax) {
    const keep = new Set(
      withDepth.nodes
        .sort((a, b) => (b.depth - a.depth) || scoreKind(b.kind) - scoreKind(a.kind))
        .slice(0, scaleMax)
        .map((n) => n.id)
    );
    withDepth = {
      nodes: withDepth.nodes.filter((n) => keep.has(n.id)),
      edges: withDepth.edges.filter((e) => keep.has(e.from) && keep.has(e.to)),
    };
  }

  // ✅ Poprawka: zapisuj tylko do ./debug/plan-*.json (bez podwójnego "debug/")
  savePlanDebug(withDepth, `plan-${slug(ctx.topicTitle)}.json`);
  return withDepth;
}

function scoreKind(k?: 'core' | 'bridge' | 'application') {
  return k === 'core' ? 3 : k === 'bridge' ? 2 : 1;
}
function slug(s: string) {
  return (s || '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]+/g, '')
    .slice(0, 60) || 'topic';
}
