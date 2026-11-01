-- Ask module: documents, chunks, question log and hybrid search.

create extension if not exists vector with schema extensions;

create table public.documents (
  id bigint generated always as identity primary key,
  url text not null unique,
  title text not null,
  kind text not null check (kind in ('page', 'pdf', 'national')),
  source text not null default 'hackney.gov.uk',
  breadcrumb text[] not null default '{}',
  service_area text,
  summary text,
  tasks text[] not null default '{}',
  facts jsonb not null default '[]',
  form_links jsonb not null default '[]',
  lastmod timestamptz,
  fetched_at timestamptz not null default now()
);

create table public.chunks (
  id bigint generated always as identity primary key,
  document_id bigint not null references public.documents (id) on delete cascade,
  idx int not null,
  heading text,
  anchor text,
  content text not null,
  -- title + breadcrumb + tasks + heading + content: what gets embedded and keyword-indexed
  embed_text text not null,
  embedding extensions.vector(1536),
  fts tsvector generated always as (to_tsvector('english', embed_text)) stored,
  unique (document_id, idx)
);

create index chunks_embedding_idx on public.chunks
  using hnsw (embedding extensions.vector_cosine_ops);
create index chunks_fts_idx on public.chunks using gin (fts);
create index documents_service_area_idx on public.documents (service_area);

-- Anonymised question log for the council insight view. No user ids or IPs.
create table public.questions (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  question text not null,
  language text,
  service_area text,
  answered boolean,
  cited_urls text[] not null default '{}'
);

alter table public.documents enable row level security;
alter table public.chunks enable row level security;
alter table public.questions enable row level security;

-- The corpus is public council information; anyone may read it. Writes need the secret key.
create policy "public read documents" on public.documents for select using (true);
create policy "public read chunks" on public.chunks for select using (true);

-- Reciprocal rank fusion of full-text and vector rankings.
create or replace function public.hybrid_search(
  query_text text,
  query_embedding extensions.vector(1536),
  match_count int default 8,
  filter_area text default null,
  full_text_weight float default 1,
  semantic_weight float default 1,
  rrf_k int default 60
)
returns table (
  chunk_id bigint,
  document_id bigint,
  url text,
  title text,
  kind text,
  service_area text,
  heading text,
  anchor text,
  content text,
  score float
)
language sql stable
set search_path = public, extensions
as $$
  with full_text as (
    select c.id, row_number() over (order by ts_rank_cd(c.fts, websearch_to_tsquery('english', query_text)) desc) as rank_ix
    from chunks c
    join documents d on d.id = c.document_id
    where c.fts @@ websearch_to_tsquery('english', query_text)
      and (filter_area is null or d.service_area = filter_area)
    order by rank_ix
    limit match_count * 4
  ),
  semantic as (
    select c.id, row_number() over (order by c.embedding <=> query_embedding) as rank_ix
    from chunks c
    join documents d on d.id = c.document_id
    where c.embedding is not null
      and (filter_area is null or d.service_area = filter_area)
    order by rank_ix
    limit match_count * 4
  )
  select
    c.id, d.id, d.url, d.title, d.kind, d.service_area, c.heading, c.anchor, c.content,
    coalesce(1.0 / (rrf_k + full_text.rank_ix), 0.0) * full_text_weight
      + coalesce(1.0 / (rrf_k + semantic.rank_ix), 0.0) * semantic_weight as score
  from full_text
  full outer join semantic on full_text.id = semantic.id
  join chunks c on c.id = coalesce(full_text.id, semantic.id)
  join documents d on d.id = c.document_id
  order by score desc
  limit match_count;
$$;
