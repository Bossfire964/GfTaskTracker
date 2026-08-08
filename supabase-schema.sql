create extension if not exists pgcrypto;

drop table if exists public.deadline_occurrences cascade;
drop table if exists public.deadlines cascade;
drop table if exists public.events cascade;
drop table if exists public.access_codes cascade;

create table public.access_codes (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  code text not null unique,
  archived boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  owner_access_code_id uuid not null references public.access_codes(id) on delete cascade,
  title text not null,
  event_date date not null,
  recurrence_type text not null check (recurrence_type in ('one_time', 'yearly')),
  notes text,
  archived boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.deadlines (
  id uuid primary key default gen_random_uuid(),
  owner_access_code_id uuid not null references public.access_codes(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  title text not null,
  due_mode text not null check (due_mode in ('days_before_event', 'specific_date')),
  due_date date,
  days_before_event integer,
  notes text,
  archived boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint deadlines_due_shape check (
    (due_mode = 'days_before_event' and days_before_event is not null and due_date is null)
    or
    (due_mode = 'specific_date' and due_date is not null and days_before_event is null)
  )
);

create table public.deadline_occurrences (
  id uuid primary key default gen_random_uuid(),
  owner_access_code_id uuid not null references public.access_codes(id) on delete cascade,
  deadline_id uuid not null references public.deadlines(id) on delete cascade,
  occurrence_year integer not null,
  due_date date not null,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (deadline_id, occurrence_year)
);

create index access_codes_code_idx on public.access_codes(code, archived);
create index events_owner_idx on public.events(owner_access_code_id, archived, event_date);
create index deadlines_owner_idx on public.deadlines(owner_access_code_id, archived, event_id);
create index deadline_occurrences_owner_idx on public.deadline_occurrences(owner_access_code_id, due_date);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.deadline_event_owner_matches()
returns trigger
language plpgsql
as $$
declare
  event_owner uuid;
begin
  select owner_access_code_id into event_owner
  from public.events
  where id = new.event_id;

  if event_owner is null then
    raise exception 'Event not found for deadline';
  end if;

  if event_owner <> new.owner_access_code_id then
    raise exception 'Deadline owner must match event owner';
  end if;

  return new;
end;
$$;

create or replace function public.occurrence_deadline_owner_matches()
returns trigger
language plpgsql
as $$
declare
  deadline_owner uuid;
begin
  select owner_access_code_id into deadline_owner
  from public.deadlines
  where id = new.deadline_id;

  if deadline_owner is null then
    raise exception 'Deadline not found for occurrence';
  end if;

  if deadline_owner <> new.owner_access_code_id then
    raise exception 'Occurrence owner must match deadline owner';
  end if;

  return new;
end;
$$;

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
before update on public.events
for each row
execute procedure public.set_updated_at();

drop trigger if exists deadlines_set_updated_at on public.deadlines;
create trigger deadlines_set_updated_at
before update on public.deadlines
for each row
execute procedure public.set_updated_at();

drop trigger if exists deadline_occurrences_set_updated_at on public.deadline_occurrences;
create trigger deadline_occurrences_set_updated_at
before update on public.deadline_occurrences
for each row
execute procedure public.set_updated_at();

drop trigger if exists deadlines_owner_guard on public.deadlines;
create trigger deadlines_owner_guard
before insert or update on public.deadlines
for each row
execute procedure public.deadline_event_owner_matches();

drop trigger if exists occurrences_owner_guard on public.deadline_occurrences;
create trigger occurrences_owner_guard
before insert or update on public.deadline_occurrences
for each row
execute procedure public.occurrence_deadline_owner_matches();

alter table public.access_codes enable row level security;
alter table public.events enable row level security;
alter table public.deadlines enable row level security;
alter table public.deadline_occurrences enable row level security;

create policy "public reads access codes"
on public.access_codes
for select
to public
using (archived = false);

create policy "public manages events"
on public.events
for all
to public
using (true)
with check (true);

create policy "public manages deadlines"
on public.deadlines
for all
to public
using (true)
with check (true);

create policy "public manages deadline occurrences"
on public.deadline_occurrences
for all
to public
using (true)
with check (true);
