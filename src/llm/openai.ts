// file: src/llm/openai.ts
/**
 * GPT-5 / Responses API:
 * - bez temperature/top_p/truncation/service_tier
 * - input podajemy jako tablicę wiadomości {role, content}
 */
import OpenAI from 'openai';
import fs from 'node:fs';
import path from 'node:path';
import { Env } from '../config/env';

const client = new OpenAI({ apiKey: Env.openaiKey, timeout: 60_000 });

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
function saveJson(file: string, obj: any) {
  try {
    ensureDir(path.dirname(file));
    fs.writeFileSync(file, JSON.stringify(obj, null, 2), 'utf8');
  } catch (err) {
    console.error('❌ Nie udało się zapisać JSON:', err);
  }
}

/** Rekurencyjne przejście po odpowiedzi: zwróć pierwszy niepusty tekst */
function dfsFindText(x: any): string | null {
  if (x == null) return null;

  // proste przypadki
  if (typeof x === 'string') {
    const t = x.trim();
    if (t) return t;
  }
  if (typeof x === 'object') {
    // popularne pola
    for (const k of ['output_text', 'text', 'content']) {
      if (typeof x[k] === 'string' && x[k].trim()) return x[k].trim();
    }
    // content jako tablica segmentów
    for (const k of ['content', 'output']) {
      const v = (x as any)[k];
      if (Array.isArray(v)) {
        for (const seg of v) {
          const got = dfsFindText(seg);
          if (got) return got;
        }
      }
    }
    // message wrappery
    if (x.message) {
      const got = dfsFindText(x.message);
      if (got) return got;
    }
    // choices (stare API)
    if (Array.isArray(x.choices) && x.choices.length) {
      const got = dfsFindText(x.choices[0]);
      if (got) return got;
    }
    // inne pola obiektowe
    for (const key of Object.keys(x)) {
      const got = dfsFindText(x[key]);
      if (got) return got;
    }
  }
  if (Array.isArray(x)) {
    for (const it of x) {
      const got = dfsFindText(it);
      if (got) return got;
    }
  }
  return null;
}

/** Uodporniony parser odpowiedzi Responses API → tekst wyjściowy */
function extractText(res: any): string {
  // szybkie ścieżki
  if (res?.output_text && String(res.output_text).trim()) return String(res.output_text).trim();

  // rekurencyjny fallback
  const found = dfsFindText(res);
  return found ? found.trim() : '';
}

// --- „luźny” parser JSON (akceptuje code fence’y itp.) ---
function stripCodeFences(s: string): string {
  const m = s.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  return m ? m[1].trim() : s.trim();
}
function tryParseJsonLoose<T = any>(txt: string): T {
  const raw = stripCodeFences((txt || '').trim());
  if (!raw) throw new Error('Empty output (no text extracted)');
  try { return JSON.parse(raw) as T; } catch {}

  const lastArray = raw.lastIndexOf(']');
  const lastObj = raw.lastIndexOf('}');
  const lastCloser = Math.max(lastArray, lastObj);
  if (lastCloser >= 0) {
    const candidate = raw.slice(0, lastCloser + 1);
    const openArr = candidate.lastIndexOf('[');
    const openObj = candidate.lastIndexOf('{');
    if (openArr > openObj && openArr >= 0) {
      const arrSlice = candidate.slice(openArr, lastCloser + 1).trim();
      try { return JSON.parse(arrSlice) as T; } catch {}
    }
    if (openObj >= 0) {
      const objSlice = candidate.slice(openObj, lastCloser + 1).trim();
      try { return JSON.parse(objSlice) as T; } catch {}
    }
  }

  const m = raw.match(/(\[[\s\S]*\]|\{[\s\S]*\})\s*$/);
  if (m) { try { return JSON.parse(m[1]) as T; } catch {} }
  throw new Error(`Invalid JSON output. First 160 chars: ${raw.slice(0, 160)}`);
}

// ───────── Markdown ─────────
export async function generateMarkdown(prompt: string): Promise<string> {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const base = path.join('debug', `openai-${ts}`);
  ensureDir('debug');
  fs.writeFileSync(`${base}.prompt.txt`, prompt, 'utf8');

  let lastErr: any;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const payload: OpenAI.Responses.ResponseCreateParamsNonStreaming = {
        model: Env.openaiModel,
        input: [
          {
            role: 'system',
            content:
              'Odpowiadasz wyłącznie tekstem (Markdown lub czysty tekst). ' +
              'Nie zadawaj pytań, nie proś o potwierdzenie, nie dodawaj wstępów ani komentarzy spoza formatu.'
          },
          { role: 'user', content: prompt },
        ],
        max_output_tokens: 8000,
      };
      saveJson(`${base}.payload.json`, payload);

      const res = await client.responses.create(payload);
      saveJson(`${base}.response.json`, res);

      const text = extractText(res);
      if (!text) {
        const hint = `Empty output (no text extracted). Inspect: ${base}.response.json`;
        fs.writeFileSync(`${base}.error.log`, hint, 'utf8');
        throw new Error(hint);
      }

      fs.writeFileSync(`${base}.output.md`, text, 'utf8');
      return text.trim();
    } catch (e: any) {
      lastErr = e;
      const msg = e?.message || String(e);
      fs.writeFileSync(`${base}.error.log`, msg, 'utf8');
      // na 429/5xx robimy 1 retry; inne kody przerywają pętlę
      if (!/429|502|503|504/.test(String(e?.status || e))) break;
    }
  }
  throw lastErr || new Error('OpenAI: empty output');
}

// ───────── JSON ─────────
export async function generateJson<T = any>(prompt: string): Promise<T> {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const base = path.join('debug', `openai-plan-${ts}`);
  ensureDir('debug');
  fs.writeFileSync(`${base}.prompt.txt`, prompt, 'utf8');

  let lastErr: any;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const payload: OpenAI.Responses.ResponseCreateParamsNonStreaming = {
        model: Env.openaiModel,
        input: [
          {
            role: 'system',
            content:
              'Zwracasz WYŁĄCZNIE poprawny JSON (bez code fence’ów i komentarzy). ' +
              'Nie zadawaj pytań ani nie proś o potwierdzenie.'
          },
          { role: 'user', content: prompt },
        ],
        max_output_tokens: 8000,
      };
      saveJson(`${base}.payload.json`, payload);

      const res = await client.responses.create(payload);
      saveJson(`${base}.response.json`, res);

      const text = extractText(res);
      if (!text) {
        const hint = `Empty output (no text extracted). Inspect: ${base}.response.json`;
        fs.writeFileSync(`${base}.error.log`, hint, 'utf8');
        throw new Error(hint);
      }

      fs.writeFileSync(`${base}.output.txt`, text, 'utf8');
      return tryParseJsonLoose<T>(text);
    } catch (e: any) {
      lastErr = e;
      const msg = e?.message || String(e);
      fs.writeFileSync(`${base}.error.log`, msg, 'utf8');
      if (!/429|502|503|504/.test(String(e?.status || e))) break;
    }
  }
  throw lastErr || new Error('OpenAI: empty output (json)');
}
