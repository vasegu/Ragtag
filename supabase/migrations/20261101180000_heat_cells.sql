-- Hotspot grid for the map heatmap; written by heatmap.py with the service role key.
create table if not exists public.heat_cells (
  cell_id        text primary key,            -- "<lat step>_<lon step>" from the grid, see heatmap.py
  lat            double precision not null,   -- mean of the cell's report coordinates
  lon            double precision not null,
  reports        integer not null,
  active_days    integer not null,
  active_weeks   integer not null,
  top_categories text,                        -- up to 3, ';' separated, most frequent first
  first_day      date,
  last_day       date,
  updated_at     timestamptz not null default now()
);

alter table public.heat_cells enable row level security;
drop policy if exists "read heat cells" on public.heat_cells;
create policy "read heat cells" on public.heat_cells for select using (true);
