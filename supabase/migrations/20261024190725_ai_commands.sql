alter table public.ai_jobs drop constraint ai_jobs_kind_check;
alter table public.ai_jobs add constraint ai_jobs_kind_check check (kind in ('image', 'model', 'command'));;
