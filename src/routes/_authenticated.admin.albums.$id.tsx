import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { getSignedUrls } from "@/lib/media";
import {
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Star,
  Trash2,
  Upload as UploadIcon,
  Video,
} from "lucide-react";
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

export const Route = createFileRoute("/_authenticated/admin/albums/$id")({
  component: AlbumDetail,
});

type MediaRow = {
  id: string;
  album_id: string;
  file_name: string;
  storage_path: string;
  media_type: "image" | "video";
  caption: string | null;
  sort_order: number;
  is_published: boolean;
};

function AlbumDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const refreshPublic = () => qc.invalidateQueries({ queryKey: ["public"] });

  const albumQuery = useQuery({
    queryKey: ["admin", "album", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("albums")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const mediaQuery = useQuery({
    queryKey: ["admin", "album", id, "media"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media")
        .select("id,album_id,file_name,storage_path,media_type,caption,sort_order,is_published")
        .eq("album_id", id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as MediaRow[];
    },
  });

  const paths = useMemo(
    () =>
      (mediaQuery.data ?? [])
        .filter((media) => media.media_type === "image")
        .map((media) => media.storage_path),
    [mediaQuery.data],
  );
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    if (paths.length === 0) return;
    let ignore = false;
    getSignedUrls(paths).then((u) => {
      if (!ignore) setUrls(u);
    });
    return () => {
      ignore = true;
    };
  }, [paths]);

  const togglePublish = useMutation({
    mutationFn: async ({ mediaId, next }: { mediaId: string; next: boolean }) => {
      const { error } = await supabase
        .from("media")
        .update({ is_published: next })
        .eq("id", mediaId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "album", id, "media"] });
      refreshPublic();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveCaption = useMutation({
    mutationFn: async ({ mediaId, caption }: { mediaId: string; caption: string | null }) => {
      const { error } = await supabase
        .from("media")
        .update({ caption })
        .eq("id", mediaId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Caption saved");
      qc.invalidateQueries({ queryKey: ["admin", "album", id, "media"] });
      refreshPublic();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setCover = useMutation({
    mutationFn: async (mediaId: string) => {
      const { error } = await supabase
        .from("albums")
        .update({ cover_media_id: mediaId })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cover updated");
      qc.invalidateQueries({ queryKey: ["admin", "album", id] });
      refreshPublic();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const move = useMutation({
    mutationFn: async ({ mediaId, direction }: { mediaId: string; direction: "up" | "down" }) => {
      const items = mediaQuery.data ?? [];
      const idx = items.findIndex((m) => m.id === mediaId);
      if (idx < 0) return;
      const target = direction === "up" ? idx - 1 : idx + 1;
      if (target < 0 || target >= items.length) return;
      const a = items[idx];
      const b = items[target];
      await supabase.from("media").update({ sort_order: b.sort_order }).eq("id", a.id);
      await supabase.from("media").update({ sort_order: a.sort_order }).eq("id", b.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "album", id, "media"] });
      refreshPublic();
    },
  });

  const deleteMedia = useMutation({
    mutationFn: async (m: MediaRow) => {
      const { error } = await supabase.from("media").delete().eq("id", m.id);
      if (error) throw error;
      await supabase.storage.from("birthday-media").remove([m.storage_path]);
    },
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["admin", "album", id, "media"] });
      refreshPublic();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (albumQuery.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!albumQuery.data) return <p className="text-muted-foreground">Album not found.</p>;

  const album = albumQuery.data;

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-3">
          <Link to="/admin/albums">
            <ChevronLeft className="h-4 w-4 mr-1" /> All albums
          </Link>
        </Button>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl text-primary">{album.name}</h1>
            {album.description && (
              <p className="text-muted-foreground max-w-2xl">{album.description}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {mediaQuery.data?.length ?? 0} item(s) · {album.is_published ? "published" : "hidden"}
            </p>
          </div>
          <Button asChild>
            <Link to="/admin/upload" search={{ albumId: album.id }}>
              <UploadIcon className="h-4 w-4 mr-2" /> Upload more
            </Link>
          </Button>
        </div>
      </div>

      {mediaQuery.data && mediaQuery.data.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            No media yet. Upload some files to this album.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {(mediaQuery.data ?? []).map((m, i, arr) => (
          <MediaCard
            key={m.id}
            item={m}
            url={urls[m.storage_path]}
            isCover={album.cover_media_id === m.id}
            isFirst={i === 0}
            isLast={i === arr.length - 1}
            onToggle={(next) => togglePublish.mutate({ mediaId: m.id, next })}
            onSaveCaption={(c) => saveCaption.mutate({ mediaId: m.id, caption: c || null })}
            onSetCover={() => setCover.mutate(m.id)}
            onMoveUp={() => move.mutate({ mediaId: m.id, direction: "up" })}
            onMoveDown={() => move.mutate({ mediaId: m.id, direction: "down" })}
            onDelete={() => deleteMedia.mutate(m)}
          />
        ))}
      </div>
    </div>
  );
}

function MediaCard({
  item,
  url,
  isCover,
  isFirst,
  isLast,
  onToggle,
  onSaveCaption,
  onSetCover,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  item: MediaRow;
  url: string | undefined;
  isCover: boolean;
  isFirst: boolean;
  isLast: boolean;
  onToggle: (next: boolean) => void;
  onSaveCaption: (c: string) => void;
  onSetCover: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}) {
  const [caption, setCaption] = useState(item.caption ?? "");
  useEffect(() => setCaption(item.caption ?? ""), [item.caption]);

  return (
    <Card className="overflow-hidden">
      <div className="aspect-square bg-muted relative">
        {item.media_type === "image" && url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={item.caption ?? item.file_name} className="w-full h-full object-cover" loading="lazy" />
        ) : item.media_type === "video" ? (
          <div className="w-full h-full flex flex-col items-center justify-center bg-muted text-muted-foreground">
            <Video className="h-10 w-10 mb-2" />
            <span className="text-xs px-2 text-center truncate max-w-full">{item.file_name}</span>
          </div>
        ) : (
          <div className="w-full h-full animate-pulse bg-muted" />
        )}
        {isCover && (
          <span className="absolute top-2 left-2 bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full">
            Cover
          </span>
        )}
      </div>
      <CardContent className="p-3 space-y-2">
        <Input
          value={caption}
          placeholder="Caption (optional)"
          onChange={(e) => setCaption(e.target.value)}
          onBlur={() => {
            if ((caption || null) !== (item.caption || null)) onSaveCaption(caption);
          }}
        />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Switch checked={item.is_published} onCheckedChange={onToggle} />
            <span className="text-xs text-muted-foreground">
              {item.is_published ? "Published" : "Hidden"}
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
        <div className="flex items-center justify-between gap-2">
          <Button size="sm" variant="outline" onClick={onSetCover} disabled={isCover}>
            <Star className="h-4 w-4 mr-1" /> Cover
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this file?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes it from the album and from storage. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}
