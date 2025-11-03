// file: src/config/env.ts
import 'dotenv/config';

export const Env = {
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '',
  openaiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-5-nano',
  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest',
  llmProvider: (process.env.LLM_PROVIDER || 'openai').toLowerCase(),
};

// opcjonalnie helpery, gdy chcesz wymusić coś dopiero w runtime:
export function requireEnv(name: keyof typeof Env) {
  const val = Env[name];
  if (!val) throw new Error(`Missing env: ${name}`);
  return val;
}
