-- Separate assessment records; existing reports/photos/updates remain intact.
create table if not exists public.street_assessments (
  id uuid primary key,
  source_report_id text,
  source_mode text not null default 'live' check (source_mode in ('live','backtest')),
  created_at timestamptz not null default now(),
  address text not null,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  resident_description text not null,
  category text not null,
  severity smallint check (severity between 1 and 5),
  queue text not null,
  outcome text not null,
  assessment jsonb not null,
  confirmed_due_at timestamptz,
  deadline_source_url text,
  photo_paths text[] not null default '{}'
);
alter table public.street_assessments enable row level security;
alter table public.street_assessments add column if not exists source_mode text not null default 'live';
alter table public.street_assessments add column if not exists confirmed_due_at timestamptz;
alter table public.street_assessments add column if not exists deadline_source_url text;
revoke all on public.street_assessments from anon, authenticated;
grant select, insert, update on public.street_assessments to service_role;
create index if not exists street_assessments_queue_idx
  on public.street_assessments (queue, severity desc, created_at);

-- Private bucket: browser access is through short-lived signed URLs from the backend.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('street-brain-photos', 'street-brain-photos', false, 3145728,
  array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- Raw new uploads use a separate bucket from harvested/backtest images.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('street-brain-uploads','street-brain-uploads',false,3145728,
  array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create table if not exists public.street_pipeline_jobs (
  id uuid primary key,
  created_at timestamptz not null default now(),
  source_bucket text not null,
  source_path text not null,
  mode text not null check (mode in ('live','backtest')),
  metadata jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending','processing','completed','failed')),
  attempts integer not null default 0 check (attempts between 0 and 3),
  expected_category text,
  result jsonb,
  error text,
  locked_at timestamptz,
  completed_at timestamptz,
  unique (source_bucket,source_path,mode)
);
alter table public.street_pipeline_jobs enable row level security;
revoke all on public.street_pipeline_jobs from anon,authenticated;
grant select,insert,update on public.street_pipeline_jobs to service_role;
create index if not exists street_pipeline_jobs_pending_idx
  on public.street_pipeline_jobs (created_at) where status in ('pending','failed');
