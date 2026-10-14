-- Requires the existing profiles, classes and sections tables.
-- This separate table does not modify or replace legacy public.materials rows.
begin;
create table if not exists public.learning_materials (
  id uuid primary key default gen_random_uuid(),
  course_key text unique,
  class_id uuid references public.classes(id) on delete cascade,
  section_id uuid references public.sections(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 150),
  filename text not null check (char_length(filename) between 1 and 180),
  extension text not null check (extension in ('pdf', 'pptx', 'docx')),
  storage_path text not null unique,
  preview_path text,
  size_bytes integer not null check (size_bytes between 1 and 20971520),
  preview_size_bytes integer check (preview_size_bytes between 1 and 20971520),
  audience text not null default 'student_and_teacher'
    check (audience in ('student_and_teacher', 'teacher')),
  status text not null default 'pending' check (status in ('pending', 'ready')),
  created_at timestamptz not null default now(),
  check ((course_key is not null and class_id is null and section_id is null and owner_id is null)
    or (course_key is null and class_id is not null and owner_id is not null)),
  check ((preview_path is null) = (preview_size_bytes is null)),
  check (extension <> 'pdf' or (preview_path is not null and preview_path = storage_path and preview_size_bytes = size_bytes)),
  check (extension <> 'docx' or preview_path is null),
  check (extension <> 'pptx' or preview_path is not null)
);
create index if not exists learning_materials_class_idx on public.learning_materials(class_id, status);
alter table public.learning_materials enable row level security;
revoke all on public.learning_materials from public, anon, authenticated;
grant all on public.learning_materials to service_role;

-- All authorization happens in the trusted API. No browser table or bucket
-- policies: clients receive short-lived links only after class/role checks.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('easycode-materials', 'easycode-materials', false, 20971520,
  array['application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Guard against a pre-existing permissive policy covering all buckets.
-- Signed upload/download links still work; service_role bypasses RLS.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage'
    and tablename = 'objects' and policyname = 'easycode_materials_api_only') then
    create policy easycode_materials_api_only on storage.objects as restrictive
      for all to anon, authenticated
      using (bucket_id <> 'easycode-materials')
      with check (bucket_id <> 'easycode-materials');
  end if;
end $$;
commit;
