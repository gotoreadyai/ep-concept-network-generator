// file: src/db/sl_handbooks.ts
import { supabase } from './supabase';

/** Dokładne wyszukiwanie handbooka po tytule. */
export async function findHandbookIdByTitle(title: string): Promise<string | undefined> {
  const { data, error } = await supabase
    .from('sl_handbooks')
    .select('id')
    .eq('title', title)
    .maybeSingle();
  if (error) throw error;
  return data?.id ? String(data.id) : undefined;
}

/** Tworzy handbook i zwraca id. (content rozdziałów dodajemy osobno) */
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
      slug: args.title.toLowerCase().replace(/\s+/g, '-').slice(0, 120),
      tags: Array.from(new Set(args.tags ?? [])),
      chapters_count: 0,
    })
    .select('id')
    .single();
  if (error) throw error;
  return String(data!.id);
}

/** Idempotentne dodanie rozdziału (tytuł+opis) pod danym sort_order. content = NULL. */
export async function insertSlChapter(args: {
  handbookId: string;
  title: string;
  description: string;
  sortOrder: number;       // 0-based
  ifNotExists?: boolean;   // gdy true → nie duplikuj po (handbook_id, lower(title))
}): Promise<boolean /*created*/> {
  if (args.ifNotExists) {
    const { data: exists, error: qErr } = await supabase
      .from('sl_chapters')
      .select('id')
      .eq('handbook_id', args.handbookId)
      .ilike('title', args.title)
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
      content: null, // <-- seed NIE zapisuje contentu
    });
  if (error) throw error;

  // licznik pomocniczo (nie krytyczny)
  await supabase
    .from('sl_handbooks')
    .update({ chapters_count: args.sortOrder + 1 })
    .eq('id', args.handbookId);

  return true;
}

/** Uzupełnij CONTENT po (handbookId, sort_order). Tytułów/Opisów nie dotykamy. */
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
