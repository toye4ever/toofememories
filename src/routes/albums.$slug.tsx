import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSignedUrls } from "@/lib/media";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, LoaderCircle, Play, RotateCw } from "lucide-react";
import { Lightbox, type LightboxItem } from "@/components/media-lightbox";

export const Route = createFileRoute("/albums/$slug")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Album — Oluwatoofe" }],
  }),
  component: AlbumPage,
});

type MediaFilter = "all" | "image" | "video";
type MediaItem = LightboxItem & { sort_order: number };

const PAGE_SIZE = 12;

function AlbumPage() {
  const { slug } = Route.useParams();
  const [filter, setFilter] = useState<MediaFilter>("all");
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [lightIdx, setLightIdx] = useState<number | null>(null);

  const albumQuery = useQuery({
    queryKey: ["public", "album", slug],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("albums")
        .select("id,name,description,slug")
        .eq("slug", slug)
        .eq("is_published", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const countsQuery = useQuery({
    queryKey: ["public", "album-counts", albumQuery.data?.id],
    enabled: !!albumQuery.data?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media")
        .select("media_type")
        .eq("album_id", albumQuery.data!.id)
        .eq("is_published", true);
      if (error) throw error;
      const rows = data ?? [];
      return {
        all: rows.length,
        image: rows.filter((row) => row.media_type === "image").length,
        video: rows.filter((row) => row.media_type === "video").length,
      };
    },
  });

  const mediaQuery = useInfiniteQuery({
    queryKey: ["public", "album-media", albumQuery.data?.id, filter],
    enabled: !!albumQuery.data?.id,
    initialPageParam: 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async ({ pageParam }) => {
      let query = supabase
        .from("media")
        .select("id,file_name,storage_path,media_type,caption,sort_order")
        .eq("album_id", albumQuery.data!.id)
        .eq("is_published", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
        .range(pageParam, pageParam + PAGE_SIZE - 1);

      if (filter !== "all") query = query.eq("media_type", filter);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as MediaItem[];
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < PAGE_SIZE ? undefined : allPages.length * PAGE_SIZE,
  });

  const pageItems = useMemo(
    () => mediaQuery.data?.pages.flatMap((page) => page) ?? [],
    [mediaQuery.data],
  );

  const imagePaths = useMemo(
    () => pageItems.filter((item) => item.media_type === "image").map((item) => item.storage_path),
    [pageItems],
  );
  const imagePathsKey = imagePaths.join("|");

  useEffect(() => {
    if (!imagePathsKey) return;
    let active = true;
    getSignedUrls(imagePaths).then((nextUrls) => {
      if (active) setUrls((previous) => ({ ...previous, ...nextUrls }));
    });
    return () => {
      active = false;
    };
  }, [imagePaths, imagePathsKey]);

  useEffect(() => {
    setLightIdx(null);
  }, [filter]);

  if (albumQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-muted-foreground">
        <LoaderCircle className="h-5 w-5 animate-spin" /> Loading album…
      </div>
    );
  }

  if (albumQuery.isError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-10 text-center">
        <p className="text-muted-foreground">The album could not be loaded.</p>
        <Button onClick={() => albumQuery.refetch()}>
          <RotateCw className="mr-2 h-4 w-4" /> Try again
        </Button>
        <Button asChild variant="ghost">
          <a href="/#albums">Back to all albums</a>
        </Button>
      </div>
    );
  }

  if (!albumQuery.data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-10 text-center">
        <p className="text-muted-foreground">This album isn&apos;t available.</p>
        <Button asChild>
          <a href="/#albums">Back to all albums</a>
        </Button>
      </div>
    );
  }

  const album = albumQuery.data;
  const counts = countsQuery.data ?? { all: 0, image: 0, video: 0 };

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <Button asChild variant="ghost" size="sm" className="-ml-3 mb-4">
          <a href="/#albums">
            <ChevronLeft className="mr-1 h-4 w-4" /> All albums
          </a>
        </Button>

        <header className="mb-8 text-center">
          <h1 className="font-display text-5xl leading-none text-primary md:text-6xl">{album.name}</h1>
          {album.description && (
            <p className="mx-auto mt-2 max-w-2xl text-muted-foreground">{album.description}</p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            {counts.all} item(s) · {counts.image} photos · {counts.video} videos
          </p>
        </header>

        <div className="mb-6 flex justify-center overflow-x-auto">
          <Tabs value={filter} onValueChange={(value) => setFilter(value as MediaFilter)}>
            <TabsList>
              <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
              <TabsTrigger value="image">Photos ({counts.image})</TabsTrigger>
              <TabsTrigger value="video">Videos ({counts.video})</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {mediaQuery.isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4">
            {Array.from({ length: 8 }, (_, index) => (
              <div key={index} className="aspect-square animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        ) : mediaQuery.isError ? (
          <div className="py-16 text-center">
            <p className="mb-4 text-muted-foreground">These memories could not be loaded.</p>
            <Button onClick={() => mediaQuery.refetch()}>
              <RotateCw className="mr-2 h-4 w-4" /> Try again
            </Button>
          </div>
        ) : pageItems.length === 0 ? (
          <p className="py-16 text-center text-muted-foreground">Nothing to show here yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4">
            {pageItems.map((item, index) => {
              const url = urls[item.storage_path];
              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => setLightIdx(index)}
                  aria-label={`Open ${item.caption || item.file_name}`}
                  className="group relative aspect-square overflow-hidden rounded-md bg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                >
                  {item.media_type === "image" ? (
                    url ? (
                      <img
                        src={url}
                        alt={item.caption ?? item.file_name}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                        decoding="async"
                        fetchPriority={index < 4 ? "auto" : "low"}
                      />
                    ) : (
                      <div className="h-full w-full animate-pulse bg-muted" />
                    )
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/20 via-accent to-primary/10">
                      <div className="rounded-full bg-white/90 p-3 shadow transition-transform group-hover:scale-105">
                        <Play className="h-6 w-6 text-primary" fill="currentColor" />
                      </div>
                      <span className="absolute bottom-2 left-2 rounded bg-black/55 px-2 py-1 text-[10px] font-medium text-white">
                        VIDEO
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {mediaQuery.hasNextPage && (
          <div className="mt-8 flex justify-center">
            <Button
              variant="outline"
              onClick={() => mediaQuery.fetchNextPage()}
              disabled={mediaQuery.isFetchingNextPage}
            >
              {mediaQuery.isFetchingNextPage ? (
                <>
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> Loading…
                </>
              ) : (
                "Load more"
              )}
            </Button>
          </div>
        )}
      </div>

      {lightIdx !== null && pageItems[lightIdx] && (
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
