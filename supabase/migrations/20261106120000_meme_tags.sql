-- AI meme tagging: subject-matter tags on images, humor-style tags on captions.
-- All tables are superadmin-only under RLS; the app writes with the logged-in user's JWT.

begin;

create table public.meme_tags (
  id bigint generated always as identity primary key,
  dimension text not null check (dimension in ('humor_style', 'subject')),
  slug varchar(64) not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name varchar(120) not null,
  description text,
  status text not null default 'proposed' check (status in ('proposed', 'active', 'retired')),
  created_datetime_utc timestamptz not null default now(),
  modified_datetime_utc timestamptz not null default now(),
  created_by_user_id uuid default auth.uid(),
  modified_by_user_id uuid default auth.uid(),
  unique (dimension, slug)
);

create table public.meme_tagging_runs (
  id bigint generated always as identity primary key,
  llm_model_id smallint references public.llm_models (id),
  model_name text not null,
  prompt_version text not null,
  taxonomy_snapshot jsonb not null,
  image_ids uuid[] not null default '{}',
  status text not null default 'running' check (status in ('running', 'completed', 'cancelled')),
  images_total integer not null default 0,
  images_done integer not null default 0,
  captions_done integer not null default 0,
  created_datetime_utc timestamptz not null default now(),
  modified_datetime_utc timestamptz not null default now(),
  created_by_user_id uuid default auth.uid(),
  modified_by_user_id uuid default auth.uid()
);

-- One row per image per run: progress tracking, errors, and "no tag fit" notes.
create table public.meme_tagging_run_items (
  run_id bigint not null references public.meme_tagging_runs (id) on delete cascade,
  image_id uuid not null references public.images (id) on delete cascade,
  status text not null check (status in ('done', 'error')),
  captions_tagged integer not null default 0,
  unfit_notes text,
  error_message text,
  created_datetime_utc timestamptz not null default now(),
  modified_datetime_utc timestamptz not null default now(),
  primary key (run_id, image_id)
);

create table public.image_meme_tags (
  run_id bigint not null references public.meme_tagging_runs (id) on delete cascade,
  image_id uuid not null references public.images (id) on delete cascade,
  meme_tag_id bigint not null references public.meme_tags (id) on delete cascade,
  is_primary boolean not null default false,
  confidence numeric(4, 3) check (confidence between 0 and 1),
  source text not null default 'ai' check (source in ('ai', 'human')),
  created_datetime_utc timestamptz not null default now(),
  created_by_user_id uuid default auth.uid(),
  primary key (run_id, image_id, meme_tag_id)
);

create table public.caption_meme_tags (
  run_id bigint not null references public.meme_tagging_runs (id) on delete cascade,
  caption_id uuid not null references public.captions (id) on delete cascade,
  meme_tag_id bigint not null references public.meme_tags (id) on delete cascade,
  is_primary boolean not null default false,
  confidence numeric(4, 3) check (confidence between 0 and 1),
  source text not null default 'ai' check (source in ('ai', 'human')),
  created_datetime_utc timestamptz not null default now(),
  created_by_user_id uuid default auth.uid(),
  primary key (run_id, caption_id, meme_tag_id)
);

create index image_meme_tags_image_id_idx on public.image_meme_tags (image_id);
create index image_meme_tags_meme_tag_id_idx on public.image_meme_tags (meme_tag_id);
create index caption_meme_tags_caption_id_idx on public.caption_meme_tags (caption_id);
create index caption_meme_tags_meme_tag_id_idx on public.caption_meme_tags (meme_tag_id);

create trigger set_modified_datetime_utc_before_update
  before update on public.meme_tags
  for each row execute function public.set_modified_datetime_utc();
create trigger set_modified_datetime_utc_before_update
  before update on public.meme_tagging_runs
  for each row execute function public.set_modified_datetime_utc();
create trigger set_modified_datetime_utc_before_update
  before update on public.meme_tagging_run_items
  for each row execute function public.set_modified_datetime_utc();

alter table public.meme_tags enable row level security;
alter table public.meme_tagging_runs enable row level security;
alter table public.meme_tagging_run_items enable row level security;
alter table public.image_meme_tags enable row level security;
alter table public.caption_meme_tags enable row level security;

create policy "Superadmins manage meme tags"
  on public.meme_tags for all to authenticated
  using ((select is_superadmin(auth.uid())))
  with check ((select is_superadmin(auth.uid())));

create policy "Superadmins manage meme tagging runs"
  on public.meme_tagging_runs for all to authenticated
  using ((select is_superadmin(auth.uid())))
  with check ((select is_superadmin(auth.uid())));

create policy "Superadmins manage meme tagging run items"
  on public.meme_tagging_run_items for all to authenticated
  using ((select is_superadmin(auth.uid())))
  with check ((select is_superadmin(auth.uid())));

create policy "Superadmins manage image meme tags"
  on public.image_meme_tags for all to authenticated
  using ((select is_superadmin(auth.uid())))
  with check ((select is_superadmin(auth.uid())));

create policy "Superadmins manage caption meme tags"
  on public.caption_meme_tags for all to authenticated
  using ((select is_superadmin(auth.uid())))
  with check ((select is_superadmin(auth.uid())));

commit;
