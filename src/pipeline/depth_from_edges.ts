// file: src/pipeline/depth_from_edges.ts
import { Plan, PlanNode } from '../types/plan';

/**
 * Wylicza depth na podstawie grafu:
 * - 'prereq' i 'extends' porządkują (u -> v; v nie może być płycej od u),
 * - 'example' i 'contrast' ignorujemy dla głębokości.
 * Strategia: topologiczne przejście i DP „najdłuższej ścieżki”.
 * Rzuca błąd przy cyklu.
 */
export function computeDepth(plan: Plan): Plan {
  const nodes = new Map<string, PlanNode>();
  for (const n of plan.nodes) nodes.set(n.id, { ...n, depth: 0 });

  const orderEdges = plan.edges.filter(e => e.type === 'prereq' || e.type === 'extends');

  const indeg = new Map<string, number>();
  for (const id of nodes.keys()) indeg.set(id, 0);
  for (const e of orderEdges) {
    if (!nodes.has(e.from) || !nodes.has(e.to)) continue;
    indeg.set(e.to, (indeg.get(e.to) || 0) + 1);
  }

  const q: string[] = [];
  for (const [id, d] of indeg) if (d === 0) q.push(id);

  const topo: string[] = [];
  while (q.length) {
    const u = q.shift()!;
    topo.push(u);
    for (const e of orderEdges) {
      if (e.from !== u) continue;
      const v = e.to;
      indeg.set(v, (indeg.get(v) || 0) - 1);
      if (indeg.get(v) === 0) q.push(v);
    }
  }

  if (topo.length !== nodes.size) {
    const cyclic = [...nodes.keys()].filter(id => !topo.includes(id));
    throw new Error(`Wykryto cykl w grafie planu: ${cyclic.join(', ')}`);
  }

  for (const v of topo) {
    const preds = orderEdges.filter(e => e.to === v).map(e => e.from);
    if (preds.length === 0) continue;
    const maxPred = Math.max(...preds.map(p => nodes.get(p)!.depth));
    nodes.get(v)!.depth = Math.max(nodes.get(v)!.depth, maxPred + 1);
  }

  return { nodes: [...nodes.values()], edges: plan.edges };
}
