import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ACCEPTED_EXTS, classifyMedia, isHiddenFile } from "@/lib/media";
import { safeFileName, slugify } from "@/lib/slug";
import { Upload as UploadIcon, RotateCw, Folder, X } from "lucide-react";

const searchSchema = z.object({ albumId: z.string().optional() });

export const Route = createFileRoute("/_authenticated/admin/upload")({
  validateSearch: searchSchema,
  component: UploadPage,
});

type FileEntry = {
  id: string;
  file: File;
  relPath: string; // includes top folder
  topFolder: string;
  status: "queued" | "uploading" | "done" | "failed" | "rejected";
  error?: string;
};

type FolderChoice = "add" | "separate" | "cancel";
type PendingConflict = {
  topFolder: string;
  existingId: string;
  existingName: string;
  resolve: (choice: FolderChoice) => void;
};

async function ensureUniqueSlug(base: string): Promise<string> {
  let candidate = base;
  let n = 2;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from("albums")
      .select("id")
      .eq("slug", candidate)
      .limit(1);
    if (error) throw error;
    if (!data || data.length === 0) return candidate;
    candidate = `${base}-${n++}`;
  }
}

async function ensureUniqueName(base: string): Promise<string> {
  let candidate = base;
  let n = 2;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from("albums")
      .select("id")
      .eq("name", candidate)
      .limit(1);
    if (error) throw error;
    if (!data || data.length === 0) return candidate;
    candidate = `${base} (${n++})`;
  }
}

function makeId() {
  return crypto.randomUUID();
}

function collectFiles(files: FileList | File[]): File[] {
  return Array.from(files);
}

function pathOf(f: File): string {
  // webkitRelativePath exists when the file came from a directory picker.
  const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath;
  return rel && rel.length > 0 ? rel : f.name;
}

async function walkEntry(entry: FileSystemEntry, basePath = ""): Promise<File[]> {
  return new Promise((resolve) => {
    if (entry.isFile) {
      (entry as FileSystemFileEntry).file((f) => {
        Object.defineProperty(f, "webkitRelativePath", {
          value: basePath + f.name,
          configurable: true,
        });
        resolve([f]);
      }, () => resolve([]));
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      const all: File[] = [];
      const readBatch = () => {
        reader.readEntries(async (entries) => {
          if (entries.length === 0) {
            resolve(all);
            return;
          }
          for (const e of entries) {
            const files = await walkEntry(e, `${basePath}${entry.name}/`);
            all.push(...files);
          }
          readBatch();
        }, () => resolve(all));
      };
      readBatch();
    } else {
      resolve([]);
    }
  });
}

function UploadPage() {
  const queryClient = useQueryClient();
  const search = Route.useSearch();
  const targetAlbumId = search.albumId;

  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [conflict, setConflict] = useState<PendingConflict | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const total = entries.length;
  const doneCount = entries.filter((e) => e.status === "done").length;
  const failedCount = entries.filter((e) => e.status === "failed").length;
  const rejectedCount = entries.filter((e) => e.status === "rejected").length;
  const progress = total > 0 ? Math.round(((doneCount + failedCount + rejectedCount) / total) * 100) : 0;

  const addFiles = useCallback((files: File[]) => {
    const next: FileEntry[] = [];
    for (const f of files) {
      const rel = pathOf(f);
      const parts = rel.split("/").filter(Boolean);
      const topFolder = parts.length > 1 ? parts[0] : ""; // empty when single files
      const baseName = parts[parts.length - 1];
      if (isHiddenFile(baseName) || isHiddenFile(rel)) continue;
      const ext = baseName.toLowerCase().split(".").pop() ?? "";
      const isAccepted = ACCEPTED_EXTS.includes(ext);
      next.push({
        id: makeId(),
        file: f,
        relPath: rel,
        topFolder,
        status: isAccepted ? "queued" : "rejected",
        error: isAccepted ? undefined : `Unsupported .${ext} file`,
      });
    }
    setEntries((prev) => [...prev, ...next]);
  }, []);

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    addFiles(collectFiles(e.target.files));
    e.target.value = "";
  };

  const onDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const items = e.dataTransfer.items;
    if (items && items.length > 0 && "webkitGetAsEntry" in items[0]) {
      const collected: File[] = [];
      for (const item of Array.from(items)) {
        const entry = item.webkitGetAsEntry?.();
        if (entry) {
          const files = await walkEntry(entry);
          collected.push(...files);
        }
      }
      if (collected.length > 0) {
        addFiles(collected);
        return;
      }
    }
    if (e.dataTransfer.files) addFiles(collectFiles(e.dataTransfer.files));
  };

  const clearAll = () => setEntries([]);
  const removeEntry = (id: string) => setEntries((prev) => prev.filter((e) => e.id !== id));

  const askConflict = (topFolder: string, existingId: string, existingName: string): Promise<FolderChoice> => {
    return new Promise((resolve) => {
      setConflict({ topFolder, existingId, existingName, resolve });
    });
  };

  const uploadOne = async (entry: FileEntry, albumId: string) => {
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, status: "uploading" } : e)));
    const kind = classifyMedia(entry.file.type, entry.file.name);
    if (!kind) {
      setEntries((prev) =>
        prev.map((e) => (e.id === entry.id ? { ...e, status: "failed", error: "Unsupported type" } : e)),
      );
      return;
    }
    const safe = safeFileName(entry.file.name);
    const path = `albums/${albumId}/${crypto.randomUUID()}-${safe}`;
    const { error: upErr } = await supabase.storage
      .from("birthday-media")
      .upload(path, entry.file, {
        contentType: entry.file.type || undefined,
        cacheControl: "31536000",
        upsert: false,
      });
    if (upErr) {
      setEntries((prev) =>
        prev.map((e) => (e.id === entry.id ? { ...e, status: "failed", error: upErr.message } : e)),
      );
      return;
    }
    // Determine next sort_order for this album
    const { data: last } = await supabase
      .from("media")
      .select("sort_order")
      .eq("album_id", albumId)
      .order("sort_order", { ascending: false })
      .limit(1);
    const nextOrder = (last?.[0]?.sort_order ?? 0) + 1;
    const { error: insErr } = await supabase.from("media").insert({
      album_id: albumId,
      file_name: entry.file.name,
      storage_path: path,
      media_type: kind,
      mime_type: entry.file.type || null,
      file_size: entry.file.size,
      sort_order: nextOrder,
      is_published: true,
    });
    if (insErr) {
      await supabase.storage.from("birthday-media").remove([path]);
      setEntries((prev) =>
        prev.map((e) => (e.id === entry.id ? { ...e, status: "failed", error: insErr.message } : e)),
      );
      return;
    }
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, status: "done" } : e)));
  };

  const runUpload = async () => {
    if (running) return;
    const acceptable = entries.filter((e) => e.status === "queued" || e.status === "failed");
    if (acceptable.length === 0) {
      toast.error("Nothing to upload");
      return;
    }
    setRunning(true);

    // Reset failed → queued for retry
    setEntries((prev) =>
      prev.map((e) => (e.status === "failed" ? { ...e, status: "queued", error: undefined } : e)),
    );

    // Group by topFolder → album id
    const groups = new Map<string, FileEntry[]>();
    for (const e of acceptable) {
      const key = e.topFolder || "__loose__";
      const arr = groups.get(key) ?? [];
      arr.push(e);
      groups.set(key, arr);
    }

    // Resolve album for each group
    const groupAlbum = new Map<string, string | null>();
    for (const [key] of groups) {
      if (targetAlbumId) {
        groupAlbum.set(key, targetAlbumId);
        continue;
      }
      if (key === "__loose__") {
        // Loose files without a folder → create "Uploads YYYY-MM-DD"
        const base = `Uploads ${new Date().toISOString().slice(0, 10)}`;
        const name = await ensureUniqueName(base);
        const slug = await ensureUniqueSlug(slugify(name));
        const { data: newAlbum, error } = await supabase
          .from("albums")
          .insert({ name, slug, is_published: false })
          .select("id")
          .single();
        if (error) {
          toast.error(`Couldn't create album: ${error.message}`);
          groupAlbum.set(key, null);
        } else {
          groupAlbum.set(key, newAlbum.id);
        }
        continue;
      }
      const { data: existing } = await supabase
        .from("albums")
        .select("id,name")
        .eq("name", key)
        .maybeSingle();
      if (existing) {
        const choice = await askConflict(key, existing.id, existing.name);
        if (choice === "cancel") {
          groupAlbum.set(key, null);
          continue;
        }
        if (choice === "add") {
          groupAlbum.set(key, existing.id);
          continue;
        }
        // separate
        const name = await ensureUniqueName(key);
        const slug = await ensureUniqueSlug(slugify(name));
        const { data: newAlbum, error } = await supabase
          .from("albums")
          .insert({ name, slug, is_published: false })
          .select("id")
          .single();
        if (error) {
          toast.error(`Couldn't create album: ${error.message}`);
          groupAlbum.set(key, null);
        } else {
          groupAlbum.set(key, newAlbum.id);
        }
      } else {
        const slug = await ensureUniqueSlug(slugify(key));
        const { data: newAlbum, error } = await supabase
          .from("albums")
          .insert({ name: key, slug, is_published: false })
          .select("id")
          .single();
        if (error) {
          toast.error(`Couldn't create album: ${error.message}`);
          groupAlbum.set(key, null);
        } else {
          groupAlbum.set(key, newAlbum.id);
        }
      }
    }

    // Upload with concurrency 3
    const jobs: Array<{ entry: FileEntry; albumId: string }> = [];
    for (const [key, list] of groups) {
      const albumId = groupAlbum.get(key);
      if (!albumId) {
        setEntries((prev) =>
          prev.map((e) =>
            list.some((x) => x.id === e.id)
              ? { ...e, status: "failed", error: "Album skipped" }
              : e,
          ),
        );
        continue;
      }
      for (const e of list) jobs.push({ entry: e, albumId });
    }

    const CONCURRENCY = 3;
    let cursor = 0;
    const worker = async () => {
      while (true) {
        const i = cursor++;
        if (i >= jobs.length) return;
        const { entry, albumId } = jobs[i];
        try {
          await uploadOne(entry, albumId);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Upload failed";
          setEntries((prev) =>
            prev.map((e) => (e.id === entry.id ? { ...e, status: "failed", error: message } : e)),
          );
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    setRunning(false);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin", "albums"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "album"] }),
      queryClient.invalidateQueries({ queryKey: ["public"] }),
    ]);
    toast.success("Upload complete");
  };

  const groupSummary = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) {
      const k = e.topFolder || "(loose files)";
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return Array.from(map.entries());
  }, [entries]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-4xl text-primary">Upload</h1>
        <p className="text-muted-foreground">
          {targetAlbumId
            ? "Uploading to a specific album."
            : "Drop or choose a folder. Its top-level folder name becomes the album name."}
        </p>
      </header>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-border"}`}
      >
        <Folder className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
        <p className="mb-4 text-muted-foreground">
          Drag a folder here, or pick one below.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            type="button"
            onClick={() => {
              if (inputRef.current) {
                inputRef.current.setAttribute("webkitdirectory", "");
                inputRef.current.setAttribute("directory", "");
                inputRef.current.click();
              }
            }}
          >
            <Folder className="h-4 w-4 mr-2" /> Choose folder
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (inputRef.current) {
                inputRef.current.removeAttribute("webkitdirectory");
                inputRef.current.removeAttribute("directory");
                inputRef.current.click();
              }
            }}
          >
            <UploadIcon className="h-4 w-4 mr-2" /> Choose files
          </Button>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          onChange={onFileInput}
          className="hidden"
        />
        <p className="mt-3 text-xs text-muted-foreground">
          Supported: {ACCEPTED_EXTS.join(", ")}
        </p>
      </div>

      {entries.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">
                  {total} file(s) · {doneCount} done · {failedCount} failed · {rejectedCount} rejected
                </p>
                <p className="text-xs text-muted-foreground">
                  Groups: {groupSummary.map(([k, n]) => `${k} (${n})`).join(", ")}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={clearAll} disabled={running}>
                  Clear
                </Button>
                <Button onClick={runUpload} disabled={running}>
                  {running ? "Uploading…" : failedCount > 0 ? (
                    <><RotateCw className="h-4 w-4 mr-2" /> Retry failed</>
                  ) : "Start upload"}
                </Button>
              </div>
            </div>
            <Progress value={progress} />

            <div className="max-h-96 overflow-auto divide-y divide-border/50 border rounded-md">
              {entries.map((e) => (
                <div key={e.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span
                    className={
                      e.status === "done"
                        ? "text-green-600"
                        : e.status === "failed" || e.status === "rejected"
                        ? "text-destructive"
                        : e.status === "uploading"
                        ? "text-primary"
                        : "text-muted-foreground"
                    }
                  >
                    {e.status}
                  </span>
                  <span className="flex-1 truncate">{e.relPath}</span>
                  {e.error && <span className="text-xs text-destructive truncate max-w-[240px]">{e.error}</span>}
                  {!running && e.status !== "done" && (
                    <Button size="icon" variant="ghost" onClick={() => removeEntry(e.id)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!conflict} onOpenChange={(open) => { if (!open && conflict) { conflict.resolve("cancel"); setConflict(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>An album named "{conflict?.topFolder}" already exists</DialogTitle>
            <DialogDescription>
              Do you want to add these files to the existing album, or create a separate one?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                conflict?.resolve("cancel");
                setConflict(null);
              }}
            >
              Cancel this folder
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                conflict?.resolve("separate");
                setConflict(null);
              }}
            >
              Create separate album
            </Button>
            <Button
              onClick={() => {
                conflict?.resolve("add");
                setConflict(null);
              }}
            >
              Add to existing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
