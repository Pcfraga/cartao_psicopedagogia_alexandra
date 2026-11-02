begin;

create function public.valid_landing_values(data jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(
    jsonb_typeof(data) = 'object'
    and (select count(*) = 9 from jsonb_object_keys(data))
    and (select bool_and(coalesce(jsonb_typeof(data -> key) = 'string'
      and length(data ->> key) <= max_length, false))
      from (values ('title',100), ('subtitle',180), ('name',60), ('role',45),
        ('cta',32), ('phone',20), ('primary',7), ('accent',7), ('format',7))
        as fields(key,max_length))
    and data ->> 'format' in ('square','story','landing')
    and data ->> 'primary' ~ '^#[0-9a-fA-F]{6}$'
    and data ->> 'accent' ~ '^#[0-9a-fA-F]{6}$', false);
$$;

create table public.studio_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  "values" jsonb not null check (public.valid_landing_values("values")),
  photo_path text not null,
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  check (photo_path like owner_id::text || '/' || id::text || '/%')
);

create table public.studio_pages (
  project_id uuid primary key references public.studio_projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$'),
  "values" jsonb not null check (public.valid_landing_values("values")),
  photo_path text not null,
  published_at timestamptz not null default now(),
  check (photo_path like owner_id::text || '/' || project_id::text || '/%')
);

alter table public.studio_projects enable row level security;
alter table public.studio_pages enable row level security;
revoke all on public.studio_projects, public.studio_pages from anon, authenticated;
grant select, insert, update, delete on public.studio_projects to authenticated;
grant select on public.studio_pages to anon, authenticated;
grant delete on public.studio_pages to authenticated;

create policy "Projects belong to their author" on public.studio_projects
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "Published snapshots are public" on public.studio_pages
  for select to anon, authenticated using (true);
create policy "Only authors can unpublish" on public.studio_pages
  for delete to authenticated using (owner_id = (select auth.uid()));

create function public.publish_studio_project(project uuid, address text, image_path text, expected_revision integer)
returns public.studio_pages language plpgsql security definer set search_path = '' as $$
declare
  draft public.studio_projects;
  published public.studio_pages;
begin
  select * into draft from public.studio_projects
    where id = project and owner_id = auth.uid() for update;
  if not found then raise exception 'Projeto não encontrado ou acesso negado.'; end if;
  if draft.revision <> expected_revision then
    raise exception 'O projeto mudou em outra aba. Abra novamente antes de publicar.';
  end if;
  if image_path not like auth.uid()::text || '/' || project::text || '/%' or
    not exists (select 1 from storage.objects where bucket_id = 'studio-public' and name = image_path) then
    raise exception 'Foto pública inválida.';
  end if;
  insert into public.studio_pages(project_id, owner_id, slug, "values", photo_path)
    values (draft.id, draft.owner_id, address, draft.values, image_path)
    on conflict (project_id) do update set slug = excluded.slug, "values" = excluded.values,
      photo_path = excluded.photo_path, published_at = now()
    returning * into published;
  return published;
end;
$$;
revoke all on function public.publish_studio_project(uuid,text,text,integer) from public, anon;
grant execute on function public.publish_studio_project(uuid,text,text,integer) to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('studio-private','studio-private',false,5242880,array['image/png']),
       ('studio-public','studio-public',true,5242880,array['image/png']);

create policy "Studio authors can upload photos" on storage.objects
  for insert to authenticated with check (
    bucket_id in ('studio-private','studio-public')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "Studio authors can read their photos" on storage.objects
  for select to authenticated using (
    bucket_id in ('studio-private','studio-public')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "Studio authors can remove their photos" on storage.objects
  for delete to authenticated using (
    bucket_id in ('studio-private','studio-public')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

commit;
