// file: src/pipeline/plan.ts
import fs from 'node:fs';
import path from 'node:path';
import { Plan } from '../types/plan';

/**
 * Próbuje sparsować JSON zwracany przez model.
 * - Akceptuje czysty JSON albo JSON wycięty z "gadulstwa" (ostatnia klamra).
 * - Rzuca błąd przy pustym wejściu lub niepoprawnym JSON.
 */
export function tryParseJson<T = any>(txt: string): T {
  const s = (txt || '').trim();
  if (!s) throw new Error('Pusty output planu');
  try { return JSON.parse(s) as T; } catch {}
  const m = s.match(/\{[\s\S]*\}$/);
  if (!m) throw new Error('Brak JSON w odpowiedzi modelu');
  return JSON.parse(m[0]) as T;
}

/**
 * Waliduje spójność grafu planu:
 * - obecność nodes/edges,
 * - krawędzie tylko między istniejącymi węzłami.
 */
export function validatePlan(plan: Plan) {
  if (!plan?.nodes?.length || !plan?.edges) {
    throw new Error('Nieprawidłowy plan: brak nodes/edges');
  }
  const ids = new Set(plan.nodes.map(n => n.id));
  for (const e of plan.edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) {
      throw new Error(`Krawędź do nieistniejącego węzła: ${e.from} -> ${e.to}`);
    }
  }
}

/**
 * Zapisuje plan do pliku debug (czytelny JSON).
 * Zwraca ścieżkę do pliku.
 */
export function savePlanDebug(plan: Plan, baseName?: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join('debug', baseName ?? `plan-${ts}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(plan, null, 2), 'utf8');
  return file;
}
