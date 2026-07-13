
-- ============ ROLES ============
create type public.app_role as enum ('admin');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

alter table public.user_roles enable row level security;

create policy "Users read own roles"
  on public.user_roles for select
  to authenticated
  using (user_id = auth.uid());

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

-- ============ updated_at helper ============
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============ ALBUMS ============
create table public.albums (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  cover_media_id uuid,
  sort_order integer not null default 0,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.albums to authenticated;
grant select on public.albums to anon;
grant all on public.albums to service_role;

alter table public.albums enable row level security;

create policy "Public reads published albums"
  on public.albums for select
  to anon, authenticated
  using (is_published = true or public.has_role(auth.uid(), 'admin'));

create policy "Admins insert albums"
  on public.albums for insert
  to authenticated
  with check (public.has_role(auth.uid(), 'admin'));

create policy "Admins update albums"
  on public.albums for update
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create policy "Admins delete albums"
  on public.albums for delete
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create trigger albums_updated_at before update on public.albums
  for each row execute function public.set_updated_at();

-- ============ MEDIA ============
create table public.media (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums(id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  media_type text not null check (media_type in ('image','video')),
  mime_type text,
  file_size bigint,
  caption text,
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.media to authenticated;
grant select on public.media to anon;
grant all on public.media to service_role;

alter table public.media enable row level security;

create policy "Public reads published media in published albums"
  on public.media for select
  to anon, authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or (
      is_published = true
      and exists (
        select 1 from public.albums a
        where a.id = media.album_id and a.is_published = true
      )
    )
  );

create policy "Admins insert media"
  on public.media for insert
  to authenticated
  with check (public.has_role(auth.uid(), 'admin'));

create policy "Admins update media"
  on public.media for update
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create policy "Admins delete media"
  on public.media for delete
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create trigger media_updated_at before update on public.media
  for each row execute function public.set_updated_at();

create index media_album_id_idx on public.media(album_id);

-- Now that media exists, add the cover FK on albums (ON DELETE SET NULL so
-- deleting a cover media row doesn't block album deletion or updates).
alter table public.albums
  add constraint albums_cover_media_id_fkey
  foreign key (cover_media_id) references public.media(id) on delete set null;

-- ============ SITE SETTINGS (single row) ============
create table public.site_settings (
  id integer primary key default 1,
  hero_title text not null default 'Happy Birthday, Oluwatoofe',
  hero_subtitle text not null default 'A little scrapbook of our memories together.',
  intro_text text not null default 'Welcome to your birthday memory book. Every album here is a small window into moments we''ve shared. Open one, take your time, and let the memories wrap around you like a warm hug.',
  letter_text text not null default 'To my dearest sister,

Every year I try to find the right words for you, and every year I fall short. So this year, I built you something instead — a little corner of the internet that holds our memories, our laughter, our messy, beautiful history together.

Thank you for being the softest place I know. Happy birthday, Oluwatoofe. I love you always.',
  footer_text text not null default 'Made with love, for Oluwatoofe.',
  updated_at timestamptz not null default now(),
  constraint site_settings_singleton check (id = 1)
);

grant select on public.site_settings to anon, authenticated;
grant insert, update on public.site_settings to authenticated;
grant all on public.site_settings to service_role;

alter table public.site_settings enable row level security;

create policy "Anyone reads site settings"
  on public.site_settings for select
  to anon, authenticated
  using (true);

create policy "Admins update site settings"
  on public.site_settings for update
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create policy "Admins insert site settings"
  on public.site_settings for insert
  to authenticated
  with check (public.has_role(auth.uid(), 'admin'));

create trigger site_settings_updated_at before update on public.site_settings
  for each row execute function public.set_updated_at();

insert into public.site_settings (id) values (1) on conflict do nothing;
