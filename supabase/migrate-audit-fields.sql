-- restaurants / visits 감사 필드
-- Supabase SQL Editor에서 실행하세요.
-- created_by / updated_by 는 나중에 Auth 연동 시 채웁니다. 지금은 null 유지.

-- 1) restaurants
alter table restaurants
  add column if not exists updated_at timestamptz;

alter table restaurants
  add column if not exists created_by text;

alter table restaurants
  add column if not exists updated_by text;

update restaurants
set updated_at = coalesce(created_at, now())
where updated_at is null;

alter table restaurants
  alter column updated_at set default now();

alter table restaurants
  alter column updated_at set not null;

-- 2) visits
alter table visits
  add column if not exists updated_at timestamptz;

alter table visits
  add column if not exists created_by text;

alter table visits
  add column if not exists updated_by text;

update visits
set updated_at = coalesce(created_at, now())
where updated_at is null;

alter table visits
  alter column updated_at set default now();

alter table visits
  alter column updated_at set not null;

-- 3) 수정 시 updated_at 자동 갱신
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists restaurants_set_updated_at on restaurants;
create trigger restaurants_set_updated_at
  before update on restaurants
  for each row
  execute function public.set_updated_at();

drop trigger if exists visits_set_updated_at on visits;
create trigger visits_set_updated_at
  before update on visits
  for each row
  execute function public.set_updated_at();
