-- Public-access and authorization hotfix.
-- Optional site-wide background music settings.
ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS music_path text,
  ADD COLUMN IF NOT EXISTS music_enabled boolean NOT NULL DEFAULT false;

-- Uses the signed-in user's own user_roles row directly, removing the exposed
-- SECURITY DEFINER role helper while keeping all writes admin-only.

update storage.buckets
set public = false
where id = 'birthday-media';

-- Albums
DROP POLICY IF EXISTS "Public reads published albums" ON public.albums;
DROP POLICY IF EXISTS "Admins read all albums" ON public.albums;
DROP POLICY IF EXISTS "Admins insert albums" ON public.albums;
DROP POLICY IF EXISTS "Admins update albums" ON public.albums;
DROP POLICY IF EXISTS "Admins delete albums" ON public.albums;

CREATE POLICY "Public reads published albums"
  ON public.albums FOR SELECT TO anon, authenticated
  USING (is_published = true);

CREATE POLICY "Admins read all albums"
  ON public.albums FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::public.app_role
  ));

CREATE POLICY "Admins insert albums"
  ON public.albums FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::public.app_role
  ));

CREATE POLICY "Admins update albums"
  ON public.albums FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::public.app_role
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::public.app_role
  ));

CREATE POLICY "Admins delete albums"
  ON public.albums FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::public.app_role
  ));

-- Media
DROP POLICY IF EXISTS "Public reads published media in published albums" ON public.media;
DROP POLICY IF EXISTS "Admins read all media" ON public.media;
DROP POLICY IF EXISTS "Admins insert media" ON public.media;
DROP POLICY IF EXISTS "Admins update media" ON public.media;
DROP POLICY IF EXISTS "Admins delete media" ON public.media;

CREATE POLICY "Public reads published media in published albums"
  ON public.media FOR SELECT TO anon, authenticated
  USING (
    is_published = true
    AND EXISTS (
      SELECT 1 FROM public.albums a
      WHERE a.id = media.album_id AND a.is_published = true
    )
  );

CREATE POLICY "Admins read all media"
  ON public.media FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::public.app_role
  ));

CREATE POLICY "Admins insert media"
  ON public.media FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::public.app_role
  ));

CREATE POLICY "Admins update media"
  ON public.media FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::public.app_role
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::public.app_role
  ));

CREATE POLICY "Admins delete media"
  ON public.media FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::public.app_role
  ));

-- Site settings writes remain admin-only; reads remain public.
DROP POLICY IF EXISTS "Admins insert site settings" ON public.site_settings;
DROP POLICY IF EXISTS "Admins update site settings" ON public.site_settings;

CREATE POLICY "Admins insert site settings"
  ON public.site_settings FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::public.app_role
  ));

CREATE POLICY "Admins update site settings"
  ON public.site_settings FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::public.app_role
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::public.app_role
  ));

-- Storage: signed URLs are available only for published media, while admins can
-- manage all objects in this bucket.
DROP POLICY IF EXISTS "Public reads published birthday-media" ON storage.objects;
DROP POLICY IF EXISTS "Admins read birthday-media" ON storage.objects;
DROP POLICY IF EXISTS "Admins upload to birthday-media" ON storage.objects;
DROP POLICY IF EXISTS "Admins update birthday-media" ON storage.objects;
DROP POLICY IF EXISTS "Admins delete birthday-media" ON storage.objects;

CREATE POLICY "Public reads published birthday-media"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (
    bucket_id = 'birthday-media'
    AND (
      EXISTS (
        SELECT 1
        FROM public.media m
        JOIN public.albums a ON a.id = m.album_id
        WHERE m.storage_path = storage.objects.name
          AND m.is_published = true
          AND a.is_published = true
      )
      OR EXISTS (
        SELECT 1
        FROM public.site_settings s
        WHERE s.id = 1
          AND s.music_enabled = true
          AND s.music_path = storage.objects.name
      )
    )
  );

CREATE POLICY "Admins read birthday-media"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'birthday-media'
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::public.app_role
    )
  );

CREATE POLICY "Admins upload to birthday-media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'birthday-media'
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::public.app_role
    )
  );

CREATE POLICY "Admins update birthday-media"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'birthday-media'
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::public.app_role
    )
  )
  WITH CHECK (
    bucket_id = 'birthday-media'
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::public.app_role
    )
  );

CREATE POLICY "Admins delete birthday-media"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'birthday-media'
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::public.app_role
    )
  );

-- Remove role helpers that triggered the Security Advisor warning.
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
DROP FUNCTION IF EXISTS private.has_role(uuid, public.app_role);
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
