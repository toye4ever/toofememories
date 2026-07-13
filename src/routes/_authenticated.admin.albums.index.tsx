import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { slugify } from "@/lib/slug";

export const Route = createFileRoute("/_authenticated/admin/albums")({
  component: AdminAlbums,
});

type AlbumRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_published: boolean;
  sort_order: number;
};

async function ensureUniqueSlug(base: string, ignoreId?: string): Promise<string> {
  let candidate = base;
  let n = 2;
  // Loop until we find a slug not present in another album.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const query = supabase.from("albums").select("id").eq("slug", candidate).limit(1);
    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0 || data[0].id === ignoreId) return candidate;
    candidate = `${base}-${n++}`;
  }
}

function AdminAlbums() {
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const albumsQuery = useQuery({
    queryKey: ["admin", "albums"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("albums")
        .select("id,name,slug,description,is_published,sort_order")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as AlbumRow[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const name = newName.trim();
      if (!name) throw new Error("Name is required");
      const slug = await ensureUniqueSlug(slugify(name));
      const maxOrder = Math.max(0, ...(albumsQuery.data?.map((a) => a.sort_order) ?? []));
      const { error } = await supabase.from("albums").insert({
        name,
        slug,
        description: newDescription.trim() || null,
        sort_order: maxOrder + 1,
        is_published: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Album created");
      setNewName("");
      setNewDescription("");
      setCreateOpen(false);
      qc.invalidateQueries({ queryKey: ["admin", "albums"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const togglePublish = useMutation({
    mutationFn: async ({ id, next }: { id: string; next: boolean }) => {
      const { error } = await supabase
        .from("albums")
        .update({ is_published: next })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "albums"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const rename = useMutation({
    mutationFn: async ({ id, name, description }: { id: string; name: string; description: string | null }) => {
      const { error } = await supabase
        .from("albums")
        .update({ name, description })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["admin", "albums"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const move = useMutation({
    mutationFn: async ({ id, direction }: { id: string; direction: "up" | "down" }) => {
      const items = albumsQuery.data ?? [];
      const idx = items.findIndex((a) => a.id === id);
      if (idx < 0) return;
      const target = direction === "up" ? idx - 1 : idx + 1;
      if (target < 0 || target >= items.length) return;
      const a = items[idx];
      const b = items[target];
      await supabase.from("albums").update({ sort_order: b.sort_order }).eq("id", a.id);
      await supabase.from("albums").update({ sort_order: a.sort_order }).eq("id", b.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "albums"] }),
  });

  const deleteAlbum = useMutation({
    mutationFn: async (id: string) => {
      // Fetch storage paths so we can attempt cleanup.
      const { data: mediaRows } = await supabase
        .from("media")
        .select("storage_path")
        .eq("album_id", id);
      const paths = (mediaRows ?? []).map((m) => m.storage_path);
      const { error } = await supabase.from("albums").delete().eq("id", id);
      if (error) throw error;
      if (paths.length > 0) {
        // Best-effort storage cleanup.
        await supabase.storage.from("birthday-media").remove(paths);
      }
    },
    onSuccess: () => {
      toast.success("Album deleted");
      qc.invalidateQueries({ queryKey: ["admin", "albums"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl text-primary">Albums</h1>
          <p className="text-muted-foreground">Rename, reorder, publish, or delete.</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> New album</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create album</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="new-name">Name</Label>
                <Input id="new-name" value={newName} onChange={(e) => setNewName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="new-desc">Description</Label>
                <Textarea id="new-desc" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      {albumsQuery.isLoading && (
        <p className="text-muted-foreground">Loading…</p>
      )}

      {albumsQuery.data && albumsQuery.data.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            No albums yet. Head to <Link to="/admin/upload" className="text-primary underline">Upload</Link> to add your first one.
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {(albumsQuery.data ?? []).map((album, i, arr) => (
          <AlbumRowCard
            key={album.id}
            album={album}
            isFirst={i === 0}
            isLast={i === arr.length - 1}
            onToggle={(next) => togglePublish.mutate({ id: album.id, next })}
            onMoveUp={() => move.mutate({ id: album.id, direction: "up" })}
            onMoveDown={() => move.mutate({ id: album.id, direction: "down" })}
            onSave={(name, description) => rename.mutate({ id: album.id, name, description })}
            onDelete={() => deleteAlbum.mutate(album.id)}
          />
        ))}
      </div>
    </div>
  );
}

function AlbumRowCard({
  album,
  isFirst,
  isLast,
  onToggle,
  onMoveUp,
  onMoveDown,
  onSave,
  onDelete,
}: {
  album: AlbumRow;
  isFirst: boolean;
  isLast: boolean;
  onToggle: (next: boolean) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onSave: (name: string, description: string | null) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(album.name);
  const [description, setDescription] = useState(album.description ?? "");

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="space-y-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    onSave(name.trim() || album.name, description.trim() || null);
                    setEditing(false);
                  }}
                >
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <CardTitle className="text-xl">{album.name}</CardTitle>
              {album.description && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                  {album.description}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">/{album.slug}</p>
            </>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <Switch checked={album.is_published} onCheckedChange={onToggle} />
            <span className="text-xs text-muted-foreground w-16">
              {album.is_published ? "Published" : "Hidden"}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" onClick={onMoveUp} disabled={isFirst}>
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={onMoveDown} disabled={isLast}>
              <ChevronDown className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button asChild size="sm">
          <Link to="/admin/albums/$id" params={{ id: album.id }}>Open</Link>
        </Button>
        {!editing && (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            Rename / edit
          </Button>
        )}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="destructive">
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete "{album.name}"?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently removes the album and all its photos and videos, including files
                in storage. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
