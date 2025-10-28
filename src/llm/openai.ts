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

/** Uodporniony parser odpowiedzi Responses API → tekst wyjściowy */
function extractText(res: any): string {
  // 1) skrótowe pole (czasem dostępne)
  if (res?.output_text && String(res.output_text).trim()) return String(res.output_text).trim();

  // 2) standard Responses: res.output: [{ type:'message', content:[{ type:'output_text', text:'...' }, ...] }, ...]
  const out = res?.output;
  if (Array.isArray(out)) {
    for (const item of out) {
      if (item?.type === 'message' && Array.isArray(item?.content)) {
        for (const piece of item.content) {
          if (piece?.type === 'output_text' && typeof piece?.text === 'string' && piece.text.trim()) {
            return piece.text.trim();
          }
          if (typeof piece?.text === 'string' && piece.text.trim()) return piece.text.trim();
          if (typeof piece?.content === 'string' && piece.content.trim()) return piece.content.trim();
          if (typeof piece?.output_text === 'string' && piece.output_text.trim()) return piece.output_text.trim();
        }
      }
      // legacy fallback: item.content bez type:'message'
      const c = (item as any)?.content;
      if (Array.isArray(c)) {
        for (const piece of c) {
          if (piece?.type === 'output_text' && typeof piece?.text === 'string' && piece.text.trim()) {
            return piece.text.trim();
          }
          if (typeof piece?.text === 'string' && piece.text.trim()) return piece.text.trim();
          if (typeof piece?.content === 'string' && piece.content.trim()) return piece.content.trim();
          if (typeof piece?.output_text === 'string' && piece.output_text.trim()) return piece.output_text.trim();
        }
      }
    }
  }

  // 3) bardzo stary fallback (gdyby lib zwrócił choices)
  const choice = res?.choices?.[0]?.message?.content;
  if (typeof choice === 'string' && choice.trim()) return choice.trim();

  return '';
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
  throw new Error(`Invalid JSON output. First 120 chars: ${raw.slice(0, 120)}`);
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
          { role: 'system', content: 'Odpowiadasz wyłącznie tekstem (Markdown lub czysty tekst).' },
          { role: 'user', content: prompt },
        ],
        max_output_tokens: 8000,
      };
      saveJson(`${base}.payload.json`, payload);
      const res = await client.responses.create(payload);
      saveJson(`${base}.response.json`, res);
      const text = extractText(res);
      if (!text) throw new Error('Empty output (no text extracted)');
      fs.writeFileSync(`${base}.output.md`, text, 'utf8');
      return text.trim();
    } catch (e: any) {
      lastErr = e;
      fs.writeFileSync(`${base}.error.log`, `${e?.message || e}`, 'utf8');
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
          { role: 'system', content: 'Zwracasz WYŁĄCZNIE poprawny JSON (bez code fence’ów i komentarzy).' },
          { role: 'user', content: prompt },
        ],
        max_output_tokens: 8000,
      };
      saveJson(`${base}.payload.json`, payload);
      const res = await client.responses.create(payload);
      saveJson(`${base}.response.json`, res);
      const text = extractText(res);
      if (!text) throw new Error('Empty output (no text extracted)');
      fs.writeFileSync(`${base}.output.txt`, text, 'utf8');
      return tryParseJsonLoose<T>(text);
    } catch (e: any) {
      lastErr = e;
      fs.writeFileSync(`${base}.error.log`, `${e?.message || e}`, 'utf8');
      if (!/429|502|503|504/.test(String(e?.status || e))) break;
    }
  }
  throw lastErr || new Error('OpenAI: empty output (json)');
}
