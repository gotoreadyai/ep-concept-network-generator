// file: src/generation/handbook/milestones.ts
import fs from 'node:fs';
import path from 'node:path';
import { generateJson } from '../../llm';

export type Milestone = {
  id: string;                 // stabilny klucz (kebab-case)
  title: string;              // krótki tytuł sceny/wydarzenia
  description: string;        // 1 zdanie — co się dzieje i dlaczego ważne
  mustBeScene?: boolean;      // czy MUSI być sceną (a nie np. listem/gazetą)
  chapterHint?: string;       // np. "finale", "midpoint", "setup" | typ rozdziału (diary/letter/newspaper/...)
  keywords?: string[];        // słowa kotwiczące (nazwiska, miejsca)
  keyFacts?: string[];        // NOWE: 5–8 kluczowych faktów do ściągi/egzaminu
  sourceUrls?: string[];      // (opcjonalnie) linki, jeśli model je poda
};

export type DiscoveredMilestones = {
  workTitle: string;
  author: string;
  milestones: Milestone[];
  generatedAt: string;
};

function slugify(s: string) {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[ąćęłńóśźż]/g, (c) => ({ą:'a',ć:'c',ę:'e',ł:'l',ń:'n',ó:'o',ś:'s',ź:'z',ż:'z'} as any)[c] || c)
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function milestonesCachePath(workTitle: string, author: string) {
  const dir = path.join('debug', 'milestones');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${slugify(workTitle)}-${slugify(author)}.json`);
}

/** Hook na web-hinty — w razie potrzeby podłączysz tu własny fetch (Bing/SerpApi/itp.). */
async function fetchWebHints(_workTitle: string, _author: string): Promise<Array<{title:string,url:string,note?:string}>> {
  // Stub: zwróć pustą tablicę jeśli nie masz przeszukiwania sieci.
  return [];
}

/** Prosi model o „kanon” scen kluczowych dla dzieła (bez twardych, ręcznych list). */
export async function discoverMilestones(workTitle: string, author: string, opts?: { force?: boolean }): Promise<DiscoveredMilestones> {
  const cachePath = milestonesCachePath(workTitle, author);
  if (!opts?.force && fs.existsSync(cachePath)) {
    try {
      const cached: DiscoveredMilestones = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      if (cached?.milestones?.length) return cached;
    } catch { /* ignore cache parse errors */ }
  }

  const web = await fetchWebHints(workTitle, author);
  const prompt = {
    task: 'Propose canonical milestones for a classic literary work (for high-school exam prep).',
    constraints: [
      'Return 6–10 milestones that cover the canonical arc (początek→środek→finał).',
      'Each milestone must be concrete (scena/wydarzenie), nie „motyw abstrakcyjny”.',
      'Mark mustBeScene=true dla momentów wymagających inscenizacji (konfrontacje, zbrodnie, spowiedzi).',
      'Prefer proper nouns (osoby/miejsca) w keywords.',
      'Dołącz sourceUrls tylko jeśli masz wysoką pewność (nie wymyślaj linków).',
      'NOWE: Każdy milestone musi zawierać "keyFacts": 5–8 krótkich, sprawdzalnych faktów (1 linia każdy).',
      'Fakty mają być rzeczowe (kto/co/gdzie/kiedy/jak/konsekwencja), bez interpretacji i bez spoilerów wykraczających poza dany milestone.'
    ],
    work: { title: workTitle, author },
    webHints: web, // może być puste — to tylko sygnał kontekstowy
    output_format: {
      workTitle: 'string',
      author: 'string',
      milestones: [
        {
          id: 'kebab-case',
          title: 'string',
          description: '1 zdanie',
          mustBeScene: 'boolean (optional)',
          chapterHint: 'string (optional)',
          keywords: ['string'],
          keyFacts: ['string'],       // ⟵ NOWE (5–8 pozycji)
          sourceUrls: ['string'],
        }
      ]
    }
  };

  const res = await generateJson<DiscoveredMilestones>(JSON.stringify(prompt, null, 2));

  const payload: DiscoveredMilestones = {
    workTitle,
    author,
    milestones: (res?.milestones || []).map((m, i) => ({
      id: m?.id || `m-${i+1}`,
      title: m?.title || `Milestone ${i+1}`,
      description: m?.description || '',
      mustBeScene: !!m?.mustBeScene,
      chapterHint: m?.chapterHint,
      keywords: Array.isArray(m?.keywords) ? m.keywords.slice(0, 6) : [],
      keyFacts: Array.isArray((m as any)?.keyFacts)
        ? (m as any).keyFacts.filter((s: any) => typeof s === 'string' && s.trim()).slice(0, 8)
        : [],
      sourceUrls: Array.isArray(m?.sourceUrls) ? m.sourceUrls.slice(0, 4) : [],
    })),
    generatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(cachePath, JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}

/** Prosta heurystyka liczby rozdziałów — adaptacyjna do liczby kamieni. */
export function suggestChapterCount(opts: {
  targetMinutes?: number;       // np. 5
  milestonesCount: number;      // 6–10 zwykle
  desiredChapters?: number;     // jeśli użytkownik podał
}): number {
  const base = Math.round((opts.targetMinutes ?? 5) / 5 * 10); // ~10 przy 5 min
  const bonus = Math.min(6, Math.ceil(opts.milestonesCount / 2)); // +0..6
  const proposed = base + bonus; // zwykle 10–16
  const clamp = (n:number,a:number,b:number)=> Math.max(a, Math.min(b,n));
  return clamp(opts.desiredChapters ?? proposed, 8, 18);
}

/** Upewnia plan, że zawiera kamienie — ewentualnie dokleja brakujące sceny. */
export function ensurePlanHasMilestones<T extends { chapters: Array<{ index:number; title:string; description:string; type:string; pov:string }> }>(
  plan: T,
  ms: Milestone[]
): T {
  if (!ms?.length) return plan;

  const has = (m: Milestone) =>
    plan.chapters.some(ch => {
      const hay = `${ch.title} ${ch.description}`.toLowerCase();
      const needles = [m.id, m.title, ...(m.keywords || [])].filter(Boolean).map(x=>String(x).toLowerCase());
      return needles.some(n => hay.includes(n));
    });

  let changed = false;
  for (const m of ms) {
    if (!has(m)) {
      plan.chapters.push({
        index: plan.chapters.length + 1,
        title: m.title,
        description: m.description || m.title,
        type: m.mustBeScene ? 'scene' : 'scene', // bezpieczny default (możesz rozwinąć logikę pod chapterHint)
        pov: '3rd_person',
      });
      changed = true;
    }
  }
  if (changed) plan.chapters.forEach((ch, i)=> ch.index = i+1);
  return plan;
}
