begin;
alter table public.submissions
  add column if not exists editor_mode text not null default 'code' check (editor_mode in ('code', 'blocks')),
  add column if not exists blocks_state jsonb check (octet_length(blocks_state::text) <= 65536),
  add column if not exists task_snapshot jsonb,
  add column if not exists lesson_id text check (lesson_id ~ '^[1-6]\.[12]$');

create table if not exists public.electronics_submissions (
  id uuid primary key, student_id uuid not null references public.profiles(id) on delete cascade,
  task_id text not null check (task_id in ('blink', 'button', 'night')),
  class_id uuid check (class_id is null), is_test boolean not null default false,
  lesson_id text check (lesson_id in ('5.1', '5.2')),
  code text not null check (char_length(code) <= 12000),
  editor_mode text not null check (editor_mode in ('code', 'blocks')),
  blocks_state jsonb check (octet_length(blocks_state::text) <= 65536),
  circuit jsonb not null check (octet_length(circuit::text) <= 16384),
  success boolean not null, feedback text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.section_grades (
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  section_key text not null check (section_key ~ '^course:[1-6]$' or section_key ~ '^custom:[0-9a-f-]{36}$'),
  teacher_id uuid not null references public.profiles(id),
  score integer not null check (score between 0 and 10),
  comment text not null default '' check (char_length(comment) <= 2000),
  updated_at timestamptz not null default now(),
  primary key (class_id, student_id, section_key),
  foreign key (class_id, student_id) references public.class_members(class_id, student_id) on delete cascade
);
alter table public.electronics_submissions enable row level security;
alter table public.section_grades enable row level security;
revoke all on public.electronics_submissions, public.section_grades from public, anon, authenticated;
grant all on public.electronics_submissions, public.section_grades to service_role;
-- Submission grading and snapshots must only be written by the trusted API.
revoke insert, update, delete on public.submissions from public, anon, authenticated;
create index if not exists submissions_review_idx on public.submissions(student_id, created_at desc);
create index if not exists electronics_review_idx on public.electronics_submissions(student_id, created_at desc);
commit;
