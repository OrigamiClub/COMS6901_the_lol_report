-- Pre-approve superadmins by email before they have signed in.
-- A profile needs an auth.users row (created by Supabase on first sign-in), so
-- instead of fabricating one, handle_new_user() grants superadmin on first
-- sign-in when the email is listed here.

create table if not exists public.superadmin_email_invites (
  email text primary key check (email = lower(trim(email))),
  note text,
  created_datetime_utc timestamptz not null default now(),
  created_by_user_id uuid references public.profiles(id) on delete set null default auth.uid(),
  accepted_datetime_utc timestamptz
);

alter table public.superadmin_email_invites enable row level security;

drop policy if exists "Superadmins manage superadmin email invites" on public.superadmin_email_invites;
create policy "Superadmins manage superadmin email invites"
  on public.superadmin_email_invites
  for all
  to authenticated
  using ((select public.is_superadmin(auth.uid())))
  with check ((select public.is_superadmin(auth.uid())));

-- Same as before, plus: superadmin if the email was invited (and mark the invite accepted).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  user_email text := lower(trim(coalesce(new.email, new.raw_user_meta_data ->> 'email')));
  invited boolean := exists (select 1 from public.superadmin_email_invites where email = user_email);
begin
  insert into public.profiles (id, first_name, last_name, email, is_superadmin)
  values (
    new.id,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    coalesce(new.email, new.raw_user_meta_data ->> 'email'),
    invited
  );

  if invited then
    update public.superadmin_email_invites
    set accepted_datetime_utc = now()
    where email = user_email;
  end if;

  return new;
end;
$function$;

-- Invites themselves are added directly in the database (not committed here), e.g.
-- insert into public.superadmin_email_invites (email, note) values ('someone@example.edu', 'who');
