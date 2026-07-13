-- WhereToGoForLunch: 현재 DB 기준 추가 마이그레이션
-- Supabase SQL Editor에서 이 파일만 실행하세요.
-- (schema.sql 전체를 다시 실행하지 마세요 — policy 중복 오류 납니다)

-- 1) reference_points: INSERT/UPDATE/DELETE 정책이 없어 저장이 막힌 상태
alter table reference_points enable row level security;

drop policy if exists "reference_points public read" on reference_points;
drop policy if exists "reference_points public insert" on reference_points;
drop policy if exists "reference_points public update" on reference_points;
drop policy if exists "reference_points public delete" on reference_points;

create policy "reference_points public read" on reference_points
  for select using (true);

create policy "reference_points public insert" on reference_points
  for insert with check (true);

create policy "reference_points public update" on reference_points
  for update using (true);

create policy "reference_points public delete" on reference_points
  for delete using (true);

-- 2) visits: 예전 스키마에서 name/cuisine이 NOT NULL이라 restaurant_id만 넣으면 실패
alter table visits alter column name drop not null;
alter table visits alter column cuisine drop not null;

-- 3) visits: 평점(rating) 컬럼 제거
alter table visits drop constraint if exists visits_rating_check;
alter table visits drop column if exists rating;

-- 4) restaurants: 팀장님이 못 가는 식당 플래그 (기본값 false = 함께 가능)
alter table restaurants drop column if exists is_excluded;

alter table restaurants
  add column if not exists exclude_for_team_leader boolean not null default false;

update restaurants
set exclude_for_team_leader = false
where exclude_for_team_leader is distinct from false;
