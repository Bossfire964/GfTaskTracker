create extension if not exists pgcrypto;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  workspace_key text not null,
  title text not null,
  event_date date not null,
  recurrence_type text not null check (recurrence_type in ('one_time', 'yearly')),
  notes text,
  archived boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.deadlines (
  id uuid primary key default gen_random_uuid(),
  workspace_key text not null,
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

create table if not exists public.deadline_occurrences (
  id uuid primary key default gen_random_uuid(),
  workspace_key text not null,
  deadline_id uuid not null references public.deadlines(id) on delete cascade,
  occurrence_year integer not null,
  due_date date not null,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (deadline_id, occurrence_year)
);

create index if not exists events_workspace_idx on public.events(workspace_key, archived, event_date);
create index if not exists deadlines_workspace_idx on public.deadlines(workspace_key, archived, event_id);
create index if not exists deadline_occurrences_workspace_idx on public.deadline_occurrences(workspace_key, due_date);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
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

alter table public.events enable row level security;
alter table public.deadlines enable row level security;
alter table public.deadline_occurrences enable row level security;

drop policy if exists "anon events access" on public.events;
create policy "anon events access"
on public.events
for all
to anon
using (true)
with check (true);

drop policy if exists "anon deadlines access" on public.deadlines;
create policy "anon deadlines access"
on public.deadlines
for all
to anon
using (true)
with check (true);

drop policy if exists "anon deadline occurrences access" on public.deadline_occurrences;
create policy "anon deadline occurrences access"
on public.deadline_occurrences
for all
to anon
using (true)
with check (true);
