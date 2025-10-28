// file: src/db/edges.ts
import { supabase } from './supabase';

export type EdgeType = 'prereq'|'extends'|'example'|'contrast';

export async function addEdge(args: {
  source: string; target: string; type: EdgeType; rfType?: string; data?: any;
}) {
  if (args.source === args.target) throw new Error('Self-edge niedozwolony');
  const { error } = await supabase.from('edges').insert({
    source: args.source,
    target: args.target,
    type: args.type,
    rf_type: args.rfType ?? 'default',
    data: args.data ?? null,
  });
  if (error) throw error;
}
