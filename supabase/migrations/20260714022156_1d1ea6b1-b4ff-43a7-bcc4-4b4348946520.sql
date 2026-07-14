
-- 1) GRANTS on public tables (previously missing)
GRANT SELECT ON public.albums TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.albums TO authenticated;
GRANT ALL ON public.albums TO service_role;

GRANT SELECT ON public.media TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.media TO authenticated;
GRANT ALL ON public.media TO service_role;

GRANT SELECT ON public.site_settings TO anon, authenticated;
GRANT INSERT, UPDATE ON public.site_settings TO authenticated;
GRANT ALL ON public.site_settings TO service_role;

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

-- 2) Create private schema (not exposed to Data API)
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO anon, authenticated, service_role;

-- 3) Create private.has_role — hardened SECURITY DEFINER
CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  );
$$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO anon, authenticated, service_role;

-- 4) Recreate all RLS policies to use private.has_role
DROP POLICY IF EXISTS "Admins insert albums" ON public.albums;
DROP POLICY IF EXISTS "Public reads published albums" ON public.albums;
DROP POLICY IF EXISTS "Admins delete albums" ON public.albums;
DROP POLICY IF EXISTS "Admins update albums" ON public.albums;

CREATE POLICY "Public reads published albums" ON public.albums FOR SELECT
  USING (is_published = true OR private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins insert albums" ON public.albums FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins update albums" ON public.albums FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins delete albums" ON public.albums FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins delete media" ON public.media;
DROP POLICY IF EXISTS "Public reads published media in published albums" ON public.media;
DROP POLICY IF EXISTS "Admins insert media" ON public.media;
DROP POLICY IF EXISTS "Admins update media" ON public.media;

CREATE POLICY "Public reads published media in published albums" ON public.media FOR SELECT
  USING (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR (
      is_published = true
      AND EXISTS (
        SELECT 1 FROM public.albums a
        WHERE a.id = media.album_id AND a.is_published = true
      )
    )
  );
CREATE POLICY "Admins insert media" ON public.media FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins update media" ON public.media FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins delete media" ON public.media FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins insert site settings" ON public.site_settings;
DROP POLICY IF EXISTS "Admins update site settings" ON public.site_settings;

CREATE POLICY "Admins insert site settings" ON public.site_settings FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins update site settings" ON public.site_settings FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

-- Storage policies
DROP POLICY IF EXISTS "Admins update birthday-media" ON storage.objects;
DROP POLICY IF EXISTS "Admins delete birthday-media" ON storage.objects;
DROP POLICY IF EXISTS "Admins read birthday-media" ON storage.objects;
DROP POLICY IF EXISTS "Public reads published birthday-media" ON storage.objects;
DROP POLICY IF EXISTS "Admins upload to birthday-media" ON storage.objects;

CREATE POLICY "Public reads published birthday-media" ON storage.objects FOR SELECT
  USING (
    bucket_id = 'birthday-media'
    AND EXISTS (
      SELECT 1
      FROM public.media m
      JOIN public.albums a ON a.id = m.album_id
      WHERE m.storage_path = storage.objects.name
        AND m.is_published = true
        AND a.is_published = true
    )
  );
CREATE POLICY "Admins read birthday-media" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'birthday-media' AND private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins upload to birthday-media" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'birthday-media' AND private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins update birthday-media" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'birthday-media' AND private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (bucket_id = 'birthday-media' AND private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins delete birthday-media" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'birthday-media' AND private.has_role(auth.uid(), 'admin'::public.app_role));

-- 5) Remove the exposed public helper
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
