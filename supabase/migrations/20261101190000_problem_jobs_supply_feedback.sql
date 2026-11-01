-- Planning layer on top of the street brain pipeline:
--   supply_units     who can do work (fictional demo crews/contractors, labelled as such)
--   problem_jobs     one row per assessed problem: what the job needs, for planning
--   problem_feedback residents disagreeing with an AI decision

create table if not exists public.supply_units (
  id                    text primary key,
  name                  text not null,
  kind                  text not null check (kind in ('in-house crew', 'contractor', 'specialist', 'enforcement')),
  trade                 text not null,            -- matches work order trade keywords, e.g. 'waste', 'highways'
  area                  text not null,            -- dashboard area: Highways, Cleansing, Lighting, Parking
  crew_size             integer not null,
  shift_start           time not null default '08:00',
  shift_minutes         integer not null default 450,
  jobs_per_day          integer not null,
  hourly_cost           numeric not null,         -- GBP, planning figure only
  callout_cost          numeric not null default 0,
  depot_lat             double precision,
  depot_lon             double precision,
  available             boolean not null default true,
  notes                 text,
  fictional             boolean not null default true
);

insert into public.supply_units (id, name, kind, trade, area, crew_size, jobs_per_day, hourly_cost, callout_cost, depot_lat, depot_lon, notes) values
  ('waste-1',      'Waste crew 1 (caged tipper)',       'in-house crew', 'waste',       'Cleansing', 2, 14, 62, 0,   51.5536, -0.0382, 'Bulky fly-tips, mattresses, bagged waste'),
  ('waste-2',      'Waste crew 2 (caged tipper)',       'in-house crew', 'waste',       'Cleansing', 2, 14, 62, 0,   51.5536, -0.0382, 'Bulky fly-tips, mattresses, bagged waste'),
  ('cleansing-1',  'Street cleansing team',             'in-house crew', 'cleansing',   'Cleansing', 2, 18, 48, 0,   51.5536, -0.0382, 'Litter, dog fouling, sharps pick-up'),
  ('graffiti-1',   'Graffiti removal van',              'in-house crew', 'graffiti',    'Cleansing', 2, 6,  58, 0,   51.5536, -0.0382, 'Pressure wash and chemical removal'),
  ('highways-1',   'Highways repair gang',              'in-house crew', 'highways',    'Highways',  3, 6,  95, 0,   51.5440, -0.0350, 'Make safe, patching, paving'),
  ('highways-ctr', 'Highways framework contractor',     'contractor',    'highways',    'Highways',  4, 8,  140, 180, 51.5440, -0.0350, 'Larger patching, traffic management included'),
  ('lighting-1',   'Street lighting electrician',       'specialist',    'electrical',  'Lighting',  2, 5,  85, 0,   51.5440, -0.0350, 'Lamp and column faults'),
  ('parking-1',    'Parking enforcement officers',      'enforcement',   'enforcement', 'Parking',   2, 20, 40, 0,   51.5450, -0.0550, 'Obstruction and abandoned vehicles')
on conflict (id) do nothing;

create table if not exists public.problem_jobs (
  problem_id         uuid primary key references public.street_assessments (id) on delete cascade,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  category           text not null,
  trade              text not null,
  bundle_key         text not null,
  size_band          text not null default 'unknown' check (size_band in ('small', 'medium', 'large', 'very large', 'unknown')),
  size_description   text,
  quantity           text,
  materials          text[] not null default '{}',
  equipment          text[] not null default '{}',
  crew_size          integer not null,
  minutes_min        integer not null,
  minutes_max        integer not null,
  traffic_management text,
  delivery_mode      text not null check (delivery_mode in ('in-house', 'contractor', 'refer')),
  cost_low           numeric,
  cost_high          numeric,
  address            text,
  lat                double precision,
  lon                double precision,
  status             text not null default 'unscheduled' check (status in ('unscheduled', 'scheduled', 'dispatched', 'done', 'referred')),
  supply_unit_id     text references public.supply_units (id),
  disputed           boolean not null default false
);
create index if not exists problem_jobs_bundle_idx on public.problem_jobs (bundle_key, status);

create table if not exists public.problem_feedback (
  id             bigint generated always as identity primary key,
  created_at     timestamptz not null default now(),
  problem_id     uuid not null references public.street_assessments (id) on delete cascade,
  stage          integer not null check (stage between 1 and 5),
  field          text not null,          -- category | responsibility | severity | other
  ai_value       text,
  resident_value text,
  comment        text
);

-- Planning data and supply are public demo data; feedback stays private. Writes need the service role.
alter table public.supply_units enable row level security;
alter table public.problem_jobs enable row level security;
alter table public.problem_feedback enable row level security;
drop policy if exists "read supply units" on public.supply_units;
create policy "read supply units" on public.supply_units for select using (true);
drop policy if exists "read problem jobs" on public.problem_jobs;
create policy "read problem jobs" on public.problem_jobs for select using (true);
