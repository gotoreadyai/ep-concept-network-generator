-- 1) Podręczniki: tytuł + opis + slug + tagi + licznik rozdziałów
create table if not exists sl_handbooks (
  id              uuid primary key default gen_random_uuid(),
  topic_id        uuid null references topics(id) on delete set null,
  title           text not null,
  description     text not null default '',
  slug            text not null unique,
  tags            text[] not null default '{}',
  chapters_count  int not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists sl_handbooks_topic_idx on sl_handbooks(topic_id);
create index if not exists sl_handbooks_tags_gin on sl_handbooks using gin (tags);

-- 2) Rozdziały: tylko kolejność, tytuł, opis (co będzie w rozdziale)
create table if not exists sl_chapters (
  id             uuid primary key default gen_random_uuid(),
  handbook_id    uuid not null references sl_handbooks(id) on delete cascade,
  sort_order     int not null,
  title          text not null,
  description    text not null default '',
  created_at     timestamptz not null default now(),
  unique (handbook_id, sort_order)
);

create index if not exists sl_chapters_handbook_idx on sl_chapters(handbook_id);
create index if not exists sl_chapters_sort_idx on sl_chapters(handbook_id, sort_order);

