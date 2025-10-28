// file: src/config/env.ts
import 'dotenv/config';

export const Env = {
  supabaseUrl: must('SUPABASE_URL'),
  supabaseKey: mustOneOf(['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY']),
  openaiKey: must('OPENAI_API_KEY'),
  openaiModel: process.env.OPENAI_MODEL || 'gpt-5-nano',
};

function must(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}
function mustOneOf(names: string[]): string {
  for (const n of names) if (process.env[n]) return process.env[n] as string;
  throw new Error(`Missing one of env: ${names.join(', ')}`);
}
