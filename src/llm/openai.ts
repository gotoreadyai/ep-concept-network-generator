// file: src/llm/openai.ts
/**
 * Implementacja tylko dla OpenAI.
 */
import OpenAI from 'openai';
import fs from 'node:fs';
import path from 'node:path';
import { Env } from '../config/env';

const client = new OpenAI({ apiKey: Env.openaiKey, timeout: 120_000 });

function ensureDir(dir: string) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }
function saveJson(file: string, obj: any) { try { ensureDir(path.dirname(file)); fs.writeFileSync(file, JSON.stringify(obj, null, 2), 'utf8'); } catch {} }

function dfsFindText(x: any): string | null {
  if (x == null) return null;
  if (typeof x === 'string') { const t = x.trim(); if (t) return t; }
  if (Array.isArray(x)) { for (const it of x) { const got = dfsFindText(it); if (got) return got; } }
  if (typeof x === 'object') {
    for (const k of ['output_text','text','content']) if (typeof x[k] === 'string' && x[k].trim()) return x[k].trim();
    for (const k of ['content','output']) { const v = (x as any)[k]; if (Array.isArray(v)) for (const seg of v) { const got = dfsFindText(seg); if (got) return got; } }
    if (x.message) { const got = dfsFindText(x.message); if (got) return got; }
    if (Array.isArray(x.choices) && x.choices.length) { const got = dfsFindText(x.choices[0]); if (got) return got; }
    for (const key of Object.keys(x)) { const got = dfsFindText((x as any)[key]); if (got) return got; }
  }
  return null;
}
function extractText(res: any): string { return dfsFindText(res) || ''; }
function stripCodeFences(s: string) { const m = s.match(/^```(?:json)?\s*([\s\S]*?)```$/i); return m ? m[1].trim() : (s||'').trim(); }
function tryParseJsonLoose<T = any>(txt: string): T {
  const raw = stripCodeFences(txt);
  try { return JSON.parse(raw) as T; } catch {}
  const last = Math.max(raw.lastIndexOf(']'), raw.lastIndexOf('}'));
  if (last >= 0) { const cand = raw.slice(0, last+1); try { return JSON.parse(cand) as T; } catch {} }
  const m = raw.match(/(\[[\s\S]*\]|\{[\s\S]*\})\s*$/); if (m) { try { return JSON.parse(m[1]) as T; } catch {} }
  throw new Error(`Invalid JSON output. First 160: ${raw.slice(0,160)}`);
}
function debugBase(prefix: string) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  ensureDir('debug'); return path.join('debug', `${prefix}-openai-${ts}`);
}

export async function generateMarkdown(prompt: string): Promise<string> {
  if (!Env.openaiKey) throw new Error('OPENAI_API_KEY nie ustawiony');
  const base = debugBase('llm-md'); fs.writeFileSync(`${base}.prompt.txt`, prompt, 'utf8');
  let lastErr: any;
  for (let attempt=1; attempt<=2; attempt++) {
    try {
      const payload: OpenAI.Responses.ResponseCreateParamsNonStreaming = {
        model: Env.openaiModel,
        input: [
          { role: 'system', content: 'Odpowiadasz wyłącznie tekstem (Markdown/czysty). Bez pytań i komentarzy.' },
          { role: 'user', content: prompt },
        ],
        max_output_tokens: 8000,
      };
      saveJson(`${base}.payload.json`, payload);
      const res = await client.responses.create(payload);
      saveJson(`${base}.response.json`, res);
      const text = extractText(res).trim();
      if (!text) throw new Error('Empty output (OpenAI)');
      fs.writeFileSync(`${base}.output.md`, text, 'utf8');
      return text;
    } catch (e:any) {
      lastErr = e; fs.writeFileSync(`${base}.error.log`, e?.message || String(e), 'utf8');
      if (!/429|502|503|504/.test(String(e?.status || e))) break;
    }
  }
  throw lastErr || new Error('OpenAI: empty output');
}

export async function generateJson<T = any>(prompt: string): Promise<T> {
  if (!Env.openaiKey) throw new Error('OPENAI_API_KEY nie ustawiony');
  const base = debugBase('llm-json'); fs.writeFileSync(`${base}.prompt.txt`, prompt, 'utf8');
  let lastErr: any;
  for (let attempt=1; attempt<=2; attempt++) {
    try {
      const payload: OpenAI.Responses.ResponseCreateParamsNonStreaming = {
        model: Env.openaiModel,
        input: [
          { role: 'system', content: 'Zwracasz WYŁĄCZNIE poprawny JSON (bez fence’ów, bez komentarzy).' },
          { role: 'user', content: prompt },
        ],
        max_output_tokens: 8000,
      };
      saveJson(`${base}.payload.json`, payload);
      const res = await client.responses.create(payload);
      saveJson(`${base}.response.json`, res);
      const text = extractText(res).trim();
      if (!text) throw new Error('Empty output (OpenAI)');
      fs.writeFileSync(`${base}.output.txt`, text, 'utf8');
      return tryParseJsonLoose<T>(text);
    } catch (e:any) {
      lastErr = e; fs.writeFileSync(`${base}.error.log`, e?.message || String(e), 'utf8');
      if (!/429|502|503|504/.test(String(e?.status || e))) break;
    }
  }
  throw lastErr || new Error('OpenAI: empty output (json)');
}
