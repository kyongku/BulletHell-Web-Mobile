create or replace view public.top_scores as
select user_id, max(score) as score
from public.scores
group by user_id;