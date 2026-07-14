-- visits 수정(UPDATE) 정책 누락 수정
-- Supabase SQL Editor에서 실행하세요.

alter table visits enable row level security;

drop policy if exists "Allow public update" on visits;
drop policy if exists "visits public update" on visits;

create policy "visits public update" on visits
  for update using (true)
  with check (true);
