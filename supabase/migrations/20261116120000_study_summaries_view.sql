-- Per-study totals for the dashboard cards, in one query instead of loading every event.
-- security_invoker: rows are filtered by the caller's RLS on the underlying tables (superadmins only).
-- "Seen"/"liked" count distinct (participant, caption) pairs, with a like matched by same
-- participant + caption + session, the same rule as the new-style report's like rate.
create or replace view public.study_summaries
with (security_invoker = true) as
select s.id as study_id,
  (select count(*) from public.study_caption_mappings m where m.study_id = s.id) as caption_count,
  seen.viewer_count, seen.captions_seen, seen.captions_liked,
  votes.vote_count, votes.voter_count,
  greatest(seen.last_view_utc, votes.last_vote_utc) as last_activity_utc
from public.studies s
left join lateral (
  select count(distinct p.profile_id) as viewer_count,
         count(*) as captions_seen,
         count(*) filter (where p.liked) as captions_liked,
         max(p.last_view_utc) as last_view_utc
  from (
    select n.profile_id, n.study_caption_mapping_id,
           max(n.created_datetime_utc) as last_view_utc,
           bool_or(exists (
             select 1 from public.study_caption_vote_events v
             where v.study_caption_mapping_id = n.study_caption_mapping_id
               and v.profile_id = n.profile_id
               and v.session_id is not distinct from n.session_id
           )) as liked
    from public.study_caption_navigation_events n
    join public.study_caption_mappings m on m.id = n.study_caption_mapping_id
    where m.study_id = s.id
    group by n.profile_id, n.study_caption_mapping_id
  ) p
) seen on true
left join lateral (
  select count(*) as vote_count, count(distinct v.profile_id) as voter_count, max(v.created_datetime_utc) as last_vote_utc
  from public.study_caption_vote_events v
  join public.study_caption_mappings m on m.id = v.study_caption_mapping_id
  where m.study_id = s.id
) votes on true
;

revoke all on public.study_summaries from anon;
grant select on public.study_summaries to authenticated;
