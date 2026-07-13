# Build Plan — Oluwatoofe Birthday Site MVP

Backend already provisioned this turn:
- `user_roles`, `has_role()`, `albums`, `media`, `site_settings` migrated with the required safeguards (media→albums CASCADE, albums.cover_media_id→media SET NULL, slug UNIQUE, admin-only writes, public read of published rows only).
- Private `birthday-media` bucket (public buckets are blocked on this workspace) with RLS: admin writes; anon SELECT only when both album AND media are published. Public thumbnails will use short-lived signed URLs — creating a signed URL requires SELECT on the object, so unpublished paths cannot be fetched by visitors even if guessed.

## Implementation order (each stage compiles cleanly)

1. **Design tokens & shell** — cream/rose/gold palette + Caveat + Inter loaded via `<link>` in `__root.tsx`; Toaster; proper `head()`.
2. **Session hook + admin guard** — `useSession` + `useIsAdmin` (checks `user_roles`), signed URL helper (bulk `createSignedUrls`).
3. **Auth routes** — `_authenticated.tsx` (ssr:false, redirects to `/admin/login`), `admin.login.tsx` (email+password, no signup).
4. **Admin shell + dashboard** — `_authenticated.admin.tsx` layout with sidebar + admin role gate; `/admin` overview counts.
5. **Folder upload** — `webkitdirectory` + drag-drop, hidden-file filter, ext filter, per-folder → album, duplicate-name dialog (Add / Create separate w/ auto `-2, -3` suffix / Cancel), max 3 concurrent, per-file status + retry, `albums/{album_id}/{uuid}-{safeName}` paths.
6. **Album management** — list w/ publish toggle, up/down reorder, rename, delete (confirm); detail page w/ media grid, caption edit, publish toggle, delete, up/down reorder, "Set as cover", "Upload more".
7. **Site settings** — form for hero title/subtitle, intro, letter, footer.
8. **Public site** — home (`/`) with hero, intro, polaroid album grid, Random Memory (published videos only), heartfelt letter, footer; `albums/$slug` with filter tabs (All/Photos/Videos) + Load More.
9. **Lightbox** — full-screen overlay, prev/next, keyboard, video autoplay-on-open / pause-on-close, single active video.
10. **SETUP.md** — enable Cloud, create/invite `oluwatoye05@gmail.com` via Cloud → Users, run one-time admin SQL, sign in at `/admin/login`, upload a folder, publish album, publish site.
11. **Verify** — production build, redirect check, permission check, sample upload, publish flow, Random Memory, lightbox nav; run security scan and address criticals.

## Notes
- `has_role` linter warning is the canonical Supabase pattern (authenticated users check their own role; policy on `user_roles` already lets them read their own rows). Safe as designed; will document in security memory.
- No mock data. Empty states are used until real content exists.
- Simplifications explicitly allowed by the brief (basic progress, generic video poster, no swipe/pinch, numeric ordering) are taken.

Approving switches to Build mode; I'll implement stages 1→11 straight through and finish with the security scan + `SETUP.md`.
