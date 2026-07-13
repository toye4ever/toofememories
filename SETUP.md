# Oluwatoofe Birthday Site — Setup

This site is a private CMS with a public front-end. There is **no public signup**.
Follow these steps once to activate the administrator account.

## 1. Enable Lovable Cloud
Already enabled for this project. Nothing to do.

## 2. Create the administrator account
1. In the Lovable editor, click **Cloud** in the sidebar.
2. Open **Users → Add user**.
3. Enter `oluwatoye05@gmail.com`, set a strong password, and check
   *Auto-confirm user* so no email verification is needed.
4. Save.

Alternative: invite the address by email and complete the confirmation flow in
your inbox before continuing.

## 3. Grant the administrator role
1. Still in **Cloud**, open the **SQL Editor**.
2. Paste and run this one-time SQL exactly as written:

```sql
insert into public.user_roles (user_id, role)
select id, 'admin'::public.app_role
from auth.users
where lower(email) = lower('oluwatoye05@gmail.com')
on conflict (user_id, role) do nothing;
```

3. Confirm the row exists:

```sql
select u.email, r.role
from public.user_roles r
join auth.users u on u.id = r.user_id;
```

The account is now the site administrator. Nobody else can be granted admin
without repeating this SQL for their account.

## 4. Sign in
1. Open `/admin/login` on the site.
2. Sign in with `oluwatoye05@gmail.com` and the password from step 2.
3. You'll land on `/admin`.

## 5. Upload the first folder
1. Go to **Admin → Upload**.
2. Click **Choose folder** (or drag a folder in).
3. The folder's name becomes the album's name.
4. If a folder with that name already exists, pick *Add to existing*, *Create
   separate*, or *Cancel*.
5. Watch the per-file status. Retry any failures with the *Retry failed* button.

## 6. Publish an album
1. Go to **Admin → Albums**.
2. Toggle the album's **Published** switch on.
3. Open the album, toggle any hidden media items to published, and use *Cover*
   to pick the album cover.

Public visitors only ever see albums where the album AND the individual media
row are both published.

## 7. Edit the letter and hero text
Admin → **Settings** lets you edit the hero title, subtitle, introduction,
heartfelt letter, and footer. Save changes appear on the public site right
away (no redeployment).

## 8. Publish the site
Click **Publish** in the top right of the Lovable editor to make the site
publicly reachable at its `.lovable.app` URL.

---

## Security notes

- The `birthday-media` storage bucket is **private**. Public visitors receive
  short-lived signed URLs, and signed URLs can only be created for media whose
  album AND media record are both published. Unpublished files are not
  reachable by visitors even if they know the path.
- Only the administrator can create, edit, publish, or delete albums, media, or
  site settings — enforced by database Row Level Security, not just by the
  frontend.
- If you ever need to revoke admin access:

```sql
delete from public.user_roles where role = 'admin';
```
