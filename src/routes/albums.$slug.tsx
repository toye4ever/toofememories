import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSignedUrls } from "@/lib/media";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, Play } from "lucide-react";
import { Lightbox, type LightboxItem } from "@/components/media-lightbox";

export const Route = createFileRoute("/albums/$slug")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Album — Oluwatoofe" },
    ],
  }),
  component: AlbumPage,
});

type MediaItem = LightboxItem & { id: string };

const PAGE_SIZE = 24;

function AlbumPage() {
  const { slug } = Route.useParams();
  const [filter, setFilter] = useState<"all" | "image" | "video">("all");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [lightIdx, setLightIdx] = useState<number | null>(null);

  const albumQuery = useQuery({
    queryKey: ["public", "album", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("albums")
        .select("id,name,description,is_published")
        .eq("slug", slug)
        .eq("is_published", true)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw notFound();
      return data;
    },
  });

  const mediaQuery = useQuery({
    queryKey: ["public", "album-media", albumQuery.data?.id],
    enabled: !!albumQuery.data?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media")
        .select("id,file_name,storage_path,media_type,caption,sort_order")
        .eq("album_id", albumQuery.data!.id)
        .eq("is_published", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MediaItem[];
    },
  });

  const filtered = useMemo(() => {
    const items = mediaQuery.data ?? [];
    if (filter === "all") return items;
    return items.filter((m) => m.media_type === filter);
  }, [mediaQuery.data, filter]);

  const pageItems = filtered.slice(0, visible);

  useEffect(() => {
    if (pageItems.length === 0) return;
    let ignore = false;
    getSignedUrls(pageItems.map((m) => m.storage_path)).then((u) => {
      if (!ignore) setUrls((prev) => ({ ...prev, ...u }));
    });
    return () => {
      ignore = true;
    };
  }, [pageItems]);

  useEffect(() => setVisible(PAGE_SIZE), [filter]);

  if (albumQuery.isLoading) {
    return <div className="p-10 text-center text-muted-foreground">Loading…</div>;
  }
  if (!albumQuery.data) {
    return (
      <div className="p-10 text-center">
        <p className="text-muted-foreground mb-4">This album isn't available.</p>
        <Button asChild><Link to="/">Back home</Link></Button>
      </div>
    );
  }

  const album = albumQuery.data;
  const counts = {
    all: mediaQuery.data?.length ?? 0,
    image: mediaQuery.data?.filter((m) => m.media_type === "image").length ?? 0,
    video: mediaQuery.data?.filter((m) => m.media_type === "video").length ?? 0,
  };

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <Button asChild variant="ghost" size="sm" className="-ml-3 mb-4">
          <Link to="/"><ChevronLeft className="h-4 w-4 mr-1" /> All albums</Link>
        </Button>

        <header className="mb-8 text-center">
          <h1 className="font-display text-5xl md:text-6xl text-primary">{album.name}</h1>
          {album.description && (
            <p className="text-muted-foreground max-w-2xl mx-auto mt-2">{album.description}</p>
          )}
          <p className="text-xs text-muted-foreground mt-2">
            {counts.all} item(s) · {counts.image} photos · {counts.video} videos
          </p>
        </header>

        <div className="flex justify-center mb-6">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <TabsList>
              <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
              <TabsTrigger value="image">Photos ({counts.image})</TabsTrigger>
              <TabsTrigger value="video">Videos ({counts.video})</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-16">
            Nothing to show here yet.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 md:gap-4">
            {pageItems.map((m, i) => (
              <button
                key={m.id}
                onClick={() => setLightIdx(i)}
                className="group relative aspect-square bg-muted rounded-md overflow-hidden focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {m.media_type === "image" && urls[m.storage_path] ? (
                  <img
                    src={urls[m.storage_path]}
                    alt={m.caption ?? m.file_name}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                ) : m.media_type === "video" ? (
                  <div className="w-full h-full bg-gradient-to-br from-primary/20 to-accent flex items-center justify-center">
                    <Play className="h-10 w-10 text-primary" fill="currentColor" />
                  </div>
                ) : (
                  <div className="w-full h-full animate-pulse bg-muted" />
                )}
              </button>
            ))}
          </div>
        )}

        {filtered.length > visible && (
          <div className="mt-8 flex justify-center">
            <Button variant="outline" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
              Load more
            </Button>
          </div>
        )}
      </div>

      {lightIdx !== null && (
        <Lightbox
          items={pageItems}
          index={lightIdx}
          onClose={() => setLightIdx(null)}
          onIndex={setLightIdx}
        />
      )}
    </div>
  );
}
