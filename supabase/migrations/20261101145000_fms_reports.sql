-- FixMyStreet harvest -> Supabase. One home per fact: lat/lon (no geometry copy), created_at (no raw "09:22 today").
-- Every field of the /report/ajax payload is a column or is already covered by one, so no raw JSON copy is kept.

create table reports (
  id           bigint primary key,            -- FixMyStreet reference; url = https://www.fixmystreet.com/report/<id>
  title        text not null,
  detail       text,
  category     text,
  state        text,                          -- as FMS gives it: confirmed, action scheduled, fixed - council, ...
  is_fixed     boolean not null default false,
  postcode     text,
  address      text,
  reported_via text,                          -- mobile / web
  via_app      text,                          -- e.g. FixMyStreet Pro
  anonymous    boolean,
  council      text,                          -- "Sent to <council>"
  lat          double precision not null,
  lon          double precision not null,
  created_at   timestamptz,
  last_update  timestamptz,
  confirmed_at timestamptz,
  areas        integer[],                     -- FMS area ids the point falls in (ward, borough, ...)
  harvested_at timestamptz not null default now()
);
create index on reports (lat, lon);
create index on reports (last_update);

create table report_updates (
  update_id    bigint primary key,
  report_id    bigint not null references reports on delete cascade,
  body         text,
  state_change text,
  posted_at    timestamptz,
  by_council   boolean not null default false,
  anonymous    boolean not null default false
);
create index on report_updates (report_id);

create table report_photos (
  id           bigserial primary key,
  report_id    bigint not null references reports on delete cascade,
  update_id    bigint references report_updates on delete cascade,  -- null = photo on the report itself
  source_url   text not null,
  storage_path text,                          -- object path in the 'images' Storage bucket
  unique (report_id, source_url)
);

-- Response times, derived (nothing stored twice). response = first council update,
-- action = first state change, resolved = first fixed/closed-type state change.
create view report_metrics with (security_invoker = true) as
with t as (
  select r.id, r.created_at,
    min(u.posted_at) filter (where u.by_council) as first_response_at,
    min(u.posted_at) filter (where u.state_change is not null) as first_action_at,
    min(u.posted_at) filter (where u.state_change ~* 'fixed|closed|unable|not responsible|duplicate|no further') as resolved_at
  from reports r left join report_updates u on u.report_id = r.id
  group by r.id
)
select *,
  extract(epoch from first_response_at - created_at) / 3600 as hours_to_response,
  extract(epoch from first_action_at   - created_at) / 3600 as hours_to_action,
  extract(epoch from resolved_at       - created_at) / 3600 as hours_to_resolved
from t;

-- Storage bucket for the image files themselves (public read; uploads use the service role).
insert into storage.buckets (id, name, public) values ('images', 'images', true)
on conflict do nothing;

-- Public read of everything (reports with and without photos); writes need the service-role key.
alter table reports        enable row level security;
alter table report_updates enable row level security;
alter table report_photos  enable row level security;
create policy "read reports" on reports        for select using (true);
create policy "read updates" on report_updates for select using (true);
create policy "read photos"  on report_photos  for select using (true);

-- Drop closed/fixed reports not touched for a month (cascades to updates + photo rows;
-- delete the Storage objects separately). Run on a schedule, e.g. pg_cron daily.
-- ponytail: state list is a guess from FMS wording, check against real `state` values after the first full harvest.
create function prune_closed_reports() returns void language sql as $$
  delete from reports
  where last_update < now() - interval '1 month'
    and (is_fixed or state in ('closed', 'fixed', 'fixed - user', 'fixed - council',
                               'unable to fix', 'not responsible', 'duplicate', 'no further action'));
$$;
