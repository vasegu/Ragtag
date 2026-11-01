-- OSM points of interest (harvest/pointsofinterest) -> Supabase. severity: 1 = most sensitive (children), 3 = least.
-- Everything else OSM has lives in `tags`, so nothing is lost without adding columns.

create table pois (
  osm_type      text not null,                 -- node / way / relation
  osm_id        bigint not null,
  category      text not null,                 -- school, kindergarten, playground, hospital, place_of_worship, park, supermarket
  severity      smallint not null,
  name          text,
  lat           double precision not null,     -- centre
  lon           double precision not null,
  bbox_min_lon  double precision,              -- outline's bounding box (a point for nodes)
  bbox_min_lat  double precision,
  bbox_max_lon  double precision,
  bbox_max_lat  double precision,
  religion      text,                          -- mosque vs church vs synagogue; denomination, phone, hours etc. are in `tags`
  operator      text,
  address       text,
  postcode      text,
  website       text,
  image_url     text,                          -- source (Wikimedia Commons)
  storage_path  text,                          -- object path in the 'images' Storage bucket
  wikidata      text,
  osm_url       text,
  tags          jsonb,
  harvested_at  timestamptz,
  primary key (osm_type, osm_id)
);
create index on pois (category);
create index on pois (lat, lon);

alter table pois enable row level security;
create policy "read pois" on pois for select using (true);
