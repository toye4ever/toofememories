
-- Admin write policies
create policy "Admins upload to birthday-media"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'birthday-media'
    and public.has_role(auth.uid(), 'admin')
  );

create policy "Admins update birthday-media"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'birthday-media'
    and public.has_role(auth.uid(), 'admin')
  )
  with check (
    bucket_id = 'birthday-media'
    and public.has_role(auth.uid(), 'admin')
  );

create policy "Admins delete birthday-media"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'birthday-media'
    and public.has_role(auth.uid(), 'admin')
  );

-- Read: admins get everything; public reads only when both album and media are published.
create policy "Admins read birthday-media"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'birthday-media'
    and public.has_role(auth.uid(), 'admin')
  );

create policy "Public reads published birthday-media"
  on storage.objects for select
  to anon, authenticated
  using (
    bucket_id = 'birthday-media'
    and exists (
      select 1
      from public.media m
      join public.albums a on a.id = m.album_id
      where m.storage_path = storage.objects.name
        and m.is_published = true
        and a.is_published = true
    )
  );
