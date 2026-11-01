-- Persistence heat cells (written by util/heatmap.py + util/upload.py). One row per ~55 m grid cell.
-- active_days / active_weeks = how many separate days / ISO weeks had a report in the cell (not the report count).
create table heat_cells (
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

alter table heat_cells enable row level security;
create policy "read heat cells" on heat_cells for select using (true);
-- no write policies: only the service-role key (util/upload.py) can write.
