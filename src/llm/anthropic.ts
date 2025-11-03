// file: src/llm/anthropic.ts
/**
 * Implementacja tylko dla Anthropic (Claude).
 */
import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import path from 'node:path';
import { Env } from '../config/env';

const client = new Anthropic({ apiKey: Env.anthropicKey });

function ensureDir(dir: string) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }
function saveJson(file: string, obj: any) { try { ensureDir(path.dirname(file)); fs.writeFileSync(file, JSON.stringify(obj, null, 2), 'utf8'); } catch {} }
function debugBase(prefix: string) { const ts = new Date().toISOString().replace(/[:.]/g, '-'); ensureDir('debug'); return path.join('debug', `${prefix}-anthropic-${ts}`); }
function extractText(msg: Anthropic.Messages.Message): string {
  const blocks = msg.content || [];
  const firstText = blocks.find(b => (b as any).type === 'text') as Anthropic.Messages.TextBlock | undefined;
  return (firstText?.text || '').trim();
}
function stripCodeFences(s: string) { const m = s.match(/^```(?:json)?\s*([\s\S]*?)```$/i); return m ? m[1].trim() : (s||'').trim(); }
function tryParseJsonLoose<T = any>(txt: string): T {
  const raw = stripCodeFences(txt);
  try { return JSON.parse(raw) as T; } catch {}
  const last = Math.max(raw.lastIndexOf(']'), raw.lastIndexOf('}'));
  if (last >= 0) { const cand = raw.slice(0, last+1); try { return JSON.parse(cand) as T; } catch {} }
  const m = raw.match(/(\[[\s\S]*\]|\{[\s\S]*\})\s*$/); if (m) { try { return JSON.parse(m[1]) as T; } catch {} }
  throw new Error(`Invalid JSON output. First 160: ${raw.slice(0,160)}`);
}

export async function generateMarkdown(prompt: string): Promise<string> {
  if (!Env.anthropicKey) throw new Error('ANTHROPIC_API_KEY nie ustawiony');
  const base = debugBase('llm-md'); fs.writeFileSync(`${base}.prompt.txt`, prompt, 'utf8');
  let lastErr: any;
  for (let attempt=1; attempt<=2; attempt++) {
    try {
      const payload = {
        model: Env.anthropicModel || 'claude-3-5-sonnet-latest',
        max_tokens: 8000,
        system: 'Odpowiadasz wyłącznie tekstem (Markdown/czysty). Bez pytań i komentarzy.',
        messages: [{ role: 'user' as const, content: prompt }],
      };
      saveJson(`${base}.payload.json`, payload);
      const res = await client.messages.create(payload);
      saveJson(`${base}.response.json`, res);
      const text = extractText(res).trim();
      if (!text) throw new Error('Empty output (Anthropic)');
      fs.writeFileSync(`${base}.output.md`, text, 'utf8');
      return text;
    } catch (e:any) {
      lastErr = e; fs.writeFileSync(`${base}.error.log`, e?.message || String(e), 'utf8');
      // brak kodów statusu w SDK — retry tylko 1x
    }
  }
  throw lastErr || new Error('Anthropic: empty output');
}

export async function generateJson<T = any>(prompt: string): Promise<T> {
  if (!Env.anthropicKey) throw new Error('ANTHROPIC_API_KEY nie ustawiony');
  const base = debugBase('llm-json'); fs.writeFileSync(`${base}.prompt.txt`, prompt, 'utf8');
  let lastErr: any;
  for (let attempt=1; attempt<=2; attempt++) {
    try {
      const payload = {
        model: Env.anthropicModel || 'claude-3-5-sonnet-latest',
        max_tokens: 8000,
        system: 'Zwracasz WYŁĄCZNIE poprawny JSON (bez fence’ów, bez komentarzy).',
        messages: [{ role: 'user' as const, content: prompt }],
      };
      saveJson(`${base}.payload.json`, payload);
      const res = await client.messages.create(payload);
      saveJson(`${base}.response.json`, res);
      const text = extractText(res).trim();
      if (!text) throw new Error('Empty output (Anthropic)');
      fs.writeFileSync(`${base}.output.txt`, text, 'utf8');
      return tryParseJsonLoose<T>(text);
    } catch (e:any) {
      lastErr = e; fs.writeFileSync(`${base}.error.log`, e?.message || String(e), 'utf8');
    }
  }
  throw lastErr || new Error('Anthropic: empty output (json)');
}
