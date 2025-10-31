// file: src/db/sl_handbooks.ts
import { supabase } from './supabase';

/** Znajdź handbook po tytule (dokładny match). */
export async function findHandbookIdByTitle(title: string): Promise<string | undefined> {
  const { data, error } = await supabase
    .from('sl_handbooks')
    .select('id')
    .eq('title', title)
    .maybeSingle();
  if (error) throw error;
  return data?.id ? String(data.id) : undefined;
}

/** Utwórz handbook i zwróć id. */
export async function insertSlHandbook(args: {
  title: string;
  description?: string;
  topicId?: string | null;
  tags?: string[];
}): Promise<string> {
  const { data, error } = await supabase
    .from('sl_handbooks')
    .insert({
      title: args.title,
      description: args.description ?? '',
      topic_id: args.topicId ?? null,
      slug: args.title.toLowerCase().replace(/\s+/g, '-').slice(0, 120), // prosty slug
      tags: Array.from(new Set(args.tags ?? [])),
      chapters_count: 0,
    })
    .select('id')
    .single();
  if (error) throw error;
  return String(data!.id);
}

/** Dodaj rozdział po sort_order; ifNotExists = idempotencja po (handbook_id, lower(title)). */
export async function insertSlChapter(args: {
  handbookId: string;
  title: string;
  description: string;
  sortOrder: number;           // 0-based
  ifNotExists?: boolean;
}): Promise<boolean /* created? */> {
  if (args.ifNotExists) {
    const { data: exists, error: qErr } = await supabase
      .from('sl_chapters')
      .select('id')
      .eq('handbook_id', args.handbookId)
      .ilike('title', args.title) // prosto; jeśli masz unikaty w DB, to i tak ochroni
      .maybeSingle();
    if (qErr) throw qErr;
    if (exists?.id) return false;
  }

  const { error } = await supabase
    .from('sl_chapters')
    .insert({
      handbook_id: args.handbookId,
      sort_order: args.sortOrder,
      title: args.title,
      description: args.description,
      content: null,
    });
  if (error) throw error;

  // aktualizuj licznik (roboczo — nie blokuje błędem jeśli się nie uda)
  await supabase
    .from('sl_handbooks')
    .update({ chapters_count: args.sortOrder + 1 })
    .eq('id', args.handbookId);

  return true;
}

/** Zaktualizuj CONTENT rozdziału po (handbookId, sort_order). Tytułu nie dotykamy. */
export async function updateSlChapterContentByOrder(args: {
  handbookId: string;
  sortOrder: number; // 0-based
  content: string;
}): Promise<void> {
  const { error } = await supabase
    .from('sl_chapters')
    .update({ content: args.content })
    .eq('handbook_id', args.handbookId)
    .eq('sort_order', args.sortOrder);
  if (error) throw error;
}
