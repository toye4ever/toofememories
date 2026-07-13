import { supabase } from "@/integrations/supabase/client";

const BUCKET = "birthday-media";
const SIGNED_TTL = 60 * 60; // 1 hour

const cache = new Map<string, { url: string; expires: number }>();

export async function getSignedUrl(path: string): Promise<string | null> {
  const now = Date.now();
  const hit = cache.get(path);
  if (hit && hit.expires > now + 60_000) return hit.url;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_TTL);
  if (error || !data) return null;
  cache.set(path, { url: data.signedUrl, expires: now + SIGNED_TTL * 1000 });
  return data.signedUrl;
}

export async function getSignedUrls(paths: string[]): Promise<Record<string, string>> {
  const now = Date.now();
  const missing: string[] = [];
  const result: Record<string, string> = {};
  for (const p of paths) {
    const hit = cache.get(p);
    if (hit && hit.expires > now + 60_000) result[p] = hit.url;
    else missing.push(p);
  }
  if (missing.length === 0) return result;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(missing, SIGNED_TTL);
  if (error || !data) return result;
  for (const item of data) {
    if (item.path && item.signedUrl && !item.error) {
      cache.set(item.path, { url: item.signedUrl, expires: now + SIGNED_TTL * 1000 });
      result[item.path] = item.signedUrl;
    }
  }
  return result;
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
