-- 프로필 컬럼 보강 (없으면 추가)
alter table if exists public.profiles
  add column if not exists gold integer not null default 0,
  add column if not exists selected_skin text not null default 'white',
  add column if not exists unlocked_skins jsonb not null default '["white"]'::jsonb;

-- 유저별 최고점 뷰
create or replace view public.top_scores as
select user_id, max(score) as score
from public.scores
group by user_id;
