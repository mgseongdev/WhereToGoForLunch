-- WhereToGoForLunch Supabase 스키마 (최초 설치용)
-- 이미 DB가 있는 경우 migrate-remaining.sql 을 사용하세요.

create table if not exists restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cuisine text not null,
  memo text default '',
  address text default '',
  latitude double precision,
  longitude double precision,
  distance_meters integer,
  distance_band text check (distance_band in ('near', 'medium', 'far')),
  exclude_for_team_leader boolean not null default false,
  created_at timestamptz default now()
);

create table if not exists reference_points (
  id uuid primary key default gen_random_uuid(),
  name text not null default '기준 위치',
  address text not null default '',
  latitude double precision not null,
  longitude double precision not null,
  updated_at timestamptz default now()
);

alter table visits add column if not exists restaurant_id uuid references restaurants(id) on delete cascade;

alter table restaurants add column if not exists address text default '';
alter table restaurants add column if not exists latitude double precision;
alter table restaurants add column if not exists longitude double precision;
alter table restaurants add column if not exists distance_meters integer;
alter table restaurants add column if not exists distance_band text;
alter table restaurants drop column if exists is_excluded;
alter table restaurants add column if not exists exclude_for_team_leader boolean not null default false;

alter table visits alter column name drop not null;
alter table visits alter column cuisine drop not null;

alter table restaurants enable row level security;
alter table reference_points enable row level security;

drop policy if exists "restaurants public read" on restaurants;
drop policy if exists "restaurants public insert" on restaurants;
drop policy if exists "restaurants public update" on restaurants;
drop policy if exists "restaurants public delete" on restaurants;

create policy "restaurants public read" on restaurants for select using (true);
create policy "restaurants public insert" on restaurants for insert with check (true);
create policy "restaurants public update" on restaurants for update using (true);
create policy "restaurants public delete" on restaurants for delete using (true);

drop policy if exists "reference_points public read" on reference_points;
drop policy if exists "reference_points public insert" on reference_points;
drop policy if exists "reference_points public update" on reference_points;
drop policy if exists "reference_points public delete" on reference_points;

create policy "reference_points public read" on reference_points for select using (true);
create policy "reference_points public insert" on reference_points for insert with check (true);
create policy "reference_points public update" on reference_points for update using (true);
create policy "reference_points public delete" on reference_points for delete using (true);
