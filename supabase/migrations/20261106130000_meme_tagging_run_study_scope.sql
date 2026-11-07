-- Optional per-study scope for tagging runs. NULL = all studies.
alter table public.meme_tagging_runs
  add column study_id bigint references public.studies (id) on delete set null;

create index meme_tagging_runs_study_id_idx on public.meme_tagging_runs (study_id);
