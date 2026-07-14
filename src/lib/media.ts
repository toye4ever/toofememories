import { supabase } from "@/integrations/supabase/client";

const BUCKET = "birthday-media";
const SIGNED_TTL = 60 * 60; // 1 hour

type CachedUrl = { url: string; expires: number };

const cache = new Map<string, CachedUrl>();
const pending = new Map<string, Promise<string | null>>();

/**
 * Returns a short-lived URL for a private Storage object.
 * Requests for the same path are de-duplicated so quick clicks and rerenders do
 * not create a burst of signed-url requests.
 */
export async function getSignedUrl(path: string): Promise<string | null> {
  if (!path) return null;

  const now = Date.now();
  const hit = cache.get(path);
  if (hit && hit.expires > now + 60_000) return hit.url;

  const inFlight = pending.get(path);
  if (inFlight) return inFlight;

  const request = (async () => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_TTL);

    if (error || !data?.signedUrl) {
      if (error) console.error(`[media] Could not sign ${path}:`, error.message);
      return null;
    }

    cache.set(path, {
      url: data.signedUrl,
      expires: Date.now() + SIGNED_TTL * 1000,
    });
    return data.signedUrl;
  })().finally(() => pending.delete(path));

  pending.set(path, request);
  return request;
}

/** Batch helper intended for image thumbnails only. Video URLs should be
 * requested on click so gallery pages never preload large video files. */
export async function getSignedUrls(paths: string[]): Promise<Record<string, string>> {
  const uniquePaths = [...new Set(paths.filter(Boolean))];
  if (uniquePaths.length === 0) return {};

  const now = Date.now();
  const missing: string[] = [];
  const result: Record<string, string> = {};

  for (const path of uniquePaths) {
    const hit = cache.get(path);
    if (hit && hit.expires > now + 60_000) result[path] = hit.url;
    else missing.push(path);
  }

  if (missing.length === 0) return result;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(missing, SIGNED_TTL);

  if (error || !data) {
    if (error) console.error("[media] Could not create signed URLs:", error.message);
    return result;
  }

  for (const item of data) {
    if (item.path && item.signedUrl && !item.error) {
      cache.set(item.path, {
        url: item.signedUrl,
        expires: Date.now() + SIGNED_TTL * 1000,
      });
      result[item.path] = item.signedUrl;
    }
  }

  return result;
}

export function clearMediaUrlCache() {
  cache.clear();
  pending.clear();
}

export function classifyMedia(mime: string, filename: string): "image" | "video" | null {
  const m = mime.toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return "image";
  if (["mp4", "mov", "webm", "m4v"].includes(ext)) return "video";
  return null;
}

export const ACCEPTED_EXTS = [
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "mp4",
  "mov",
  "webm",
  "m4v",
];

export function isHiddenFile(name: string): boolean {
  const base = name.split("/").pop() ?? "";
  if (base.startsWith(".") || base.startsWith("._")) return true;
  const lower = base.toLowerCase();
  return lower === "thumbs.db" || lower === "desktop.ini";
}
