# Birthday Site Hotfix

## Fixed

- Album pages no longer preload video files.
- Video files are requested only after a visitor clicks a video card.
- The lightbox remains stable when a video is clicked immediately, closed while
  loading, or replaced by another item.
- Album pages fetch 12 items at a time instead of loading an entire album.
- Photo/video filters use separate paginated queries.
- Album covers load without visiting the admin dashboard first and fall back to
  the first published image.
- Random Memory counts eligible videos and fetches only the selected row.
- Public and admin query caches are separated and admin cache is cleared on
  logout.
- Public access/RLS policies are repaired by `SUPABASE_HOTFIX.sql`.
- The exposed role helper is removed to address the Security Advisor warning.
- Background music can be uploaded from Admin Settings and muted by visitors.
- Future uploads use long-lived browser caching because every file path is UUID
  versioned.

## Required deployment steps

1. Push these files to the GitHub repository connected to Lovable.
2. Run `SUPABASE_HOTFIX.sql` in **Lovable Cloud → SQL Editor**.
3. Wait for GitHub/Lovable sync to complete, then publish.
4. Test the public URL in an incognito window.

## Browser video support

MP4 using H.264/AAC is the safest format across browsers. Some MOV and M4V
files may upload successfully but fail to play in Chrome or Firefox because of
the codec inside the file. Convert those specific files to MP4 when possible.
