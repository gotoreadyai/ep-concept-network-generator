// file: src/db/supabase.ts
import { createClient } from '@supabase/supabase-js';
import { Env } from '../config/env';
import crypto from 'node:crypto';

// ---- Klient Supabase ----
export const supabase = createClient(Env.supabaseUrl, Env.supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---- Pomocnicze: slug + sort ----
function slugFromTitle(title: string): string {
  const base = (title || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[ąćęłńóśźż]/g, (c) => ({ 'ą':'a','ć':'c','ę':'e','ł':'l','ń':'n','ó':'o','ś':'s','ź':'z','ż':'z' } as any)[c] || c)
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    .slice(0, 120);
  const r = crypto.randomUUID().slice(0, 8);
  return base ? `${base}-${r}` : `page-${r}`;
}

/** Zwraca kolejny sort_order w obrębie danego topicu i (opcjonalnie) pageType. */
export async function nextSortOrder(topicId: string, pageType?: string): Promise<number> {
  let query = supabase
    .from('pages')
    .select('sort_order')
    .eq('topic_id', topicId)
    .order('sort_order', { ascending: false })
    .limit(1);

  if (pageType) query = query.eq('page_type', pageType);

  const { data, error } = await query;
  if (error) throw error;

  const top = (data?.[0]?.sort_order ?? null) as number | null;
  return typeof top === 'number' && Number.isFinite(top) ? top + 1 : 0;
}

/** Jednolita funkcja wstawiania strony do tabeli `pages`. Zwraca `id`. */
export async function insertPage(args: {
  topicId: string;
  title: string;
  markdown: string;
  pageType: string;               // 'concept' | 'source_material' | ...
  tags?: string[];
  forTopicTitle?: string;         // przydatne dla źródeł
}): Promise<string> {
  const sortOrder = await nextSortOrder(args.topicId, args.pageType);
  const slug = slugFromTitle(args.title);

  const baseTags = [`topic:${args.topicId}`, args.pageType];
  if (args.forTopicTitle) baseTags.push(`source.for:${args.forTopicTitle}`);
  const tags = Array.from(new Set([...(args.tags || []), ...baseTags]));

  const { data, error } = await supabase
    .from('pages')
    .insert({
      topic_id: args.topicId,
      title: args.title,
      markdown: args.markdown,
      page_type: args.pageType,
      tags,
      slug,
      sort_order: sortOrder,
    })
    .select('id')
    .single();

  if (error) throw error;
  return String(data!.id);
}

export async function insertConceptPage(args: {
  topicId: string;
  title: string;
  markdown: string;
  tags?: string[]; // np. concept.variant:magazine
}): Promise<string> {
  return insertPage({
    ...args,
    pageType: 'concept',
    tags: ['concept.type:core', ...(args.tags || [])],
  });
}

export async function insertSourceMaterialPage(args: {
  topicId: string; title: string; markdown: string; forTopicTitle: string;
}): Promise<string> {
  return insertPage({
    topicId: args.topicId,
    title: args.title,
    markdown: args.markdown,
    pageType: 'source_material',
    forTopicTitle: args.forTopicTitle,
  });
}

// ---- Kontekst Topic → Section → Subject ----
export async function fetchTopicWithContext(topicId: string) {
  const { data: topic, error: tErr } = await supabase
    .from('topics')
    .select('id, title, description, section_id')
    .eq('id', topicId)
    .maybeSingle();
  if (tErr) throw tErr;
  if (!topic) throw new Error(`Topic not found: ${topicId}`);

  let section: { id: string; title: string | null; description: string | null } | null = null;
  let subjectId: string | null = null;

  if (topic.section_id) {
    const { data: secBasic, error: secErr } = await supabase
      .from('sections')
      .select('id, title, description, subject_id')
      .eq('id', topic.section_id)
      .maybeSingle();
    if (secErr) throw secErr;
    section = (secBasic as any) ?? null;
    subjectId = (secBasic as any)?.subject_id ?? null;
  }

  let subjectName = '';
  if (subjectId) {
    const { data: subj, error: subjErr } = await supabase
      .from('subjects')
      .select('id, name, slug, description')
      .eq('id', subjectId)
      .maybeSingle();
    if (subjErr) throw subjErr;
    subjectName = String((subj as any)?.name || '').trim();
  }

  return {
    topicId,
    topicTitle: String(topic.title ?? ''),
    topicDescription: String(topic.description ?? ''),
    sectionTitle: String(section?.title ?? ''),
    sectionDescription: String(section?.description ?? ''),
    subjectName,
  };
}

export async function fetchConceptPages(topicId: string): Promise<Array<{ id: string; title: string; markdown: string }>> {
  const { data, error } = await supabase
    .from('pages')
    .select('id, title, markdown')
    .eq('topic_id', topicId)
    .eq('page_type', 'concept')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data || []).map((p: any) => ({ id: String(p.id), title: String(p.title || ''), markdown: String(p.markdown || '') }));
}
