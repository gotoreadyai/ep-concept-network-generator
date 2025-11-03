// file: src/db/handbooks_repo.ts
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Brak SUPABASE_URL lub klucza (SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY) w .env');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export type UpsertHandbookRow = { id: string; slug: string };

function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u2013\u2014]/g, '-') // en/em dash -> '-'
    .replace(/[\u0300-\u036f]/g, '') // diakrytyki
    .replace(/[^a-zA-Z0-9\s-]/g, '') // znaki spec.
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
}

/** Upsert handbooka po slug’u (tytuł jest unikalny po slugu). Zwraca id i slug. */
export async function upsertHandbookAscii(opts: {
  title: string;
  description: string;
}): Promise<UpsertHandbookRow> {
  const payload = {
    title: opts.title,
    slug: slugify(opts.title),
    description: opts.description || 'Skrót dzieła.',
    is_paid: false,
    price: 0,
  };
  const { data, error } = await supabase
    .from('sl_handbooks')
    .upsert(payload, { onConflict: 'slug' })
    .select('id, slug')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Nie udało się upsertować handbooka');
  return data as UpsertHandbookRow;
}

/** Znajdź handbook po dokładnym tytule „{workTitle} - wersja skrócona”. */
export async function findHandbookIdByTitleAscii(workTitle: string): Promise<string | null> {
  const title = `${workTitle} - wersja skrócona`;
  const { data, error } = await supabase
    .from('sl_handbooks')
    .select('id')
    .eq('title', title)
    .maybeSingle();
  if (error && (error as any).code !== 'PGRST116') throw error;
  return (data as any)?.id ?? null;
}

/** Upsert metadanych rozdziału po (handbook_id, sort_order). Content zostaje NULL. */
export async function ensureChapterMeta(
  handbookId: string,
  sortOrder0: number,
  title: string,
  description: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('sl_chapters')
    .upsert(
      {
        handbook_id: handbookId,
        sort_order: sortOrder0,
        title,
        description,
        content: null,
      },
      { onConflict: 'handbook_id,sort_order' }
    )
    .select('id')
    .maybeSingle();

  if (error) throw error;
  return (data as any)?.id ?? null;
}

/** Ustaw content rozdziału po (handbook_id, sort_order). Jeśli nie istnieje — upsert. */
export async function setChapterContentForce(
  handbookId: string,
  sortOrder0: number,
  meta: { title: string; description: string },
  content: string
): Promise<void> {
  const { data, error } = await supabase
    .from('sl_chapters')
    .update({ content })
    .eq('handbook_id', handbookId)
    .eq('sort_order', sortOrder0)
    .select('id');

  if (error) throw error;

  if (!data || (Array.isArray(data) && data.length === 0)) {
    const { error: e2 } = await supabase
      .from('sl_chapters')
      .upsert(
        {
          handbook_id: handbookId,
          sort_order: sortOrder0,
          title: meta.title,
          description: meta.description,
          content,
        },
        { onConflict: 'handbook_id,sort_order' }
      );
    if (e2) throw e2;
  }
}

/** Zaktualizuj licznik rozdziałów w handbooku. */
export async function updateHandbookChaptersCount(handbookId: string, count: number): Promise<void> {
  const { error } = await supabase
    .from('sl_handbooks')
    .update({ chapters_count: count })
    .eq('id', handbookId);
  if (error) throw error;
}
