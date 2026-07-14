import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSignedUrls } from "@/lib/media";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, Heart, Image as ImageIcon, LoaderCircle } from "lucide-react";
import { Lightbox, type LightboxItem } from "@/components/media-lightbox";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Happy Birthday, Oluwatoofe" },
      {
        name: "description",
        content: "A little scrapbook of memories for my sister's birthday.",
      },
    ],
  }),
  component: Home,
});

type Album = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  cover_media_id: string | null;
};

type Cover = {
  album_id: string;
  id: string;
  storage_path: string;
  url: string | null;
};

function Home() {
  const settings = useQuery({
    queryKey: ["site_settings"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("hero_title,hero_subtitle,intro_text,letter_text,footer_text")
        .eq("id", 1)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const albums = useQuery({
    queryKey: ["public", "albums"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("albums")
        .select("id,name,slug,description,cover_media_id")
        .eq("is_published", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Album[];
    },
  });

  const albumSignature = useMemo(
    () =>
      (albums.data ?? [])
        .map((album) => `${album.id}:${album.cover_media_id ?? ""}`)
        .join("|"),
    [albums.data],
  );

  const covers = useQuery({
    queryKey: ["public", "album-covers", albumSignature],
    enabled: !!albums.data && albums.data.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const albumRows = albums.data ?? [];
      const selectedCoverIds = albumRows
        .map((album) => album.cover_media_id)
        .filter((id): id is string => !!id);

      const selectedById = new Map<
        string,
        { id: string; album_id: string; storage_path: string }
      >();

      if (selectedCoverIds.length > 0) {
        const { data, error } = await supabase
          .from("media")
          .select("id,album_id,storage_path")
          .in("id", selectedCoverIds)
          .eq("is_published", true)
          .eq("media_type", "image");
        if (error) throw error;
        for (const row of data ?? []) selectedById.set(row.id, row);
      }

      const resolved = await Promise.all(
        albumRows.map(async (album) => {
          const selected = album.cover_media_id
            ? selectedById.get(album.cover_media_id)
            : undefined;
          if (selected && selected.album_id === album.id) {
            return selected;
          }

          const { data, error } = await supabase
            .from("media")
            .select("id,album_id,storage_path")
            .eq("album_id", album.id)
            .eq("is_published", true)
            .eq("media_type", "image")
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          if (error) throw error;
          return data ?? null;
        }),
      );

      const valid = resolved.filter((cover): cover is NonNullable<typeof cover> => !!cover);
      const signed = await getSignedUrls(valid.map((cover) => cover.storage_path));
      return valid.map(
        (cover): Cover => ({
          ...cover,
          url: signed[cover.storage_path] ?? null,
        }),
      );
    },
  });

  const [randomItem, setRandomItem] = useState<LightboxItem | null>(null);
  const [randomLoading, setRandomLoading] = useState(false);

  async function playRandom() {
    if (randomLoading) return;
    setRandomLoading(true);
    try {
      const { count, error: countError } = await supabase
        .from("media")
        .select("id", { count: "exact", head: true })
        .eq("is_published", true)
        .eq("media_type", "video");
      if (countError) throw countError;

      if (!count) {
        toast.info("No published videos yet.");
        return;
      }

      const offset = Math.floor(Math.random() * count);
      const { data, error } = await supabase
        .from("media")
        .select("id,storage_path,media_type,file_name,caption")
        .eq("is_published", true)
        .eq("media_type", "video")
        .order("created_at", { ascending: true })
        .range(offset, offset)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        toast.info("No published videos yet.");
        return;
      }

      setRandomItem({
        id: data.id,
        storage_path: data.storage_path,
        media_type: "video",
        file_name: data.file_name,
        caption: data.caption,
      });
    } catch (error) {
      console.error("[random-memory]", error);
      toast.error("Couldn't load a random memory. Please try again.");
    } finally {
      setRandomLoading(false);
    }
  }

  const letterParagraphs = (settings.data?.letter_text ?? "")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (
    <div className="min-h-screen">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-accent/40 via-background to-background" />
        <div className="mx-auto max-w-4xl px-6 pb-24 pt-16 text-center md:pb-32 md:pt-28">
          <p className="mb-2 font-display text-2xl text-primary/80">A little something for</p>
          <h1 className="font-display text-6xl leading-none text-primary md:text-8xl">
            {settings.data?.hero_title ?? "Happy Birthday, Oluwatoofe"}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            {settings.data?.hero_subtitle ?? "A little scrapbook of our memories together."}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <a href="#albums">Open our memories</a>
            </Button>
            <Button size="lg" variant="outline" onClick={playRandom} disabled={randomLoading}>
              {randomLoading ? (
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              {randomLoading ? "Finding…" : "Random memory"}
            </Button>
          </div>
        </div>
      </section>

      {settings.data?.intro_text && (
        <section className="mx-auto max-w-2xl px-6 py-10 text-center">
          <p className="whitespace-pre-line text-lg leading-relaxed text-foreground/90">
            {settings.data.intro_text}
          </p>
        </section>
      )}

      <section id="albums" className="mx-auto max-w-6xl scroll-mt-4 px-6 py-12">
        <div className="mb-10 text-center">
          <h2 className="font-display text-5xl text-primary">Our albums</h2>
          <p className="mt-1 text-muted-foreground">Little windows into moments we've shared.</p>
        </div>

        {albums.isLoading && (
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="polaroid">
                <div className="mb-2 aspect-square animate-pulse bg-muted" />
                <div className="mx-auto h-7 w-2/3 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        )}

        {albums.isError && (
          <Card className="mx-auto max-w-lg">
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">The albums could not be loaded.</p>
              <Button className="mt-4" onClick={() => albums.refetch()}>
                Try again
              </Button>
            </CardContent>
          </Card>
        )}

        {albums.data && albums.data.length === 0 && (
          <Card className="mx-auto max-w-lg">
            <CardContent className="py-12 text-center text-muted-foreground">
              The album shelf is still empty — beautiful memories coming soon.
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-3">
          {(albums.data ?? []).map((album, index) => {
            const cover = covers.data?.find((item) => item.album_id === album.id);
            const rotate = [-2, 1.5, -1, 2, -1.5, 1][index % 6];
            return (
              <Link
                key={album.id}
                to="/albums/$slug"
                params={{ slug: album.slug }}
                className="group block"
                style={{ transform: `rotate(${rotate}deg)` }}
              >
                <div className="polaroid transition-transform duration-300 group-hover:-translate-y-1 group-hover:rotate-0">
                  <div className="relative mb-2 aspect-square overflow-hidden bg-muted">
                    {cover?.url ? (
                      <img
                        src={cover.url}
                        alt={album.name}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading={index < 3 ? "eager" : "lazy"}
                        decoding="async"
                        fetchPriority={index === 0 ? "high" : "low"}
                      />
                    ) : covers.isLoading ? (
                      <div className="h-full w-full animate-pulse bg-muted" />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-primary/10 via-accent to-primary/5 text-muted-foreground">
                        <ImageIcon className="h-10 w-10 text-primary/60" />
                        <span className="text-sm">Memories inside</span>
                      </div>
                    )}
                  </div>
                  <div className="text-center">
                    <p className="font-display text-2xl leading-tight text-primary">{album.name}</p>
                    {album.description && (
                      <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                        {album.description}
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {letterParagraphs.length > 0 && (
        <section className="mt-8 bg-accent/30 py-16">
          <div className="mx-auto max-w-2xl px-6">
            <div className="mb-6 flex items-center justify-center gap-2 text-primary">
              <Heart className="h-5 w-5" />
              <h2 className="font-display text-4xl">A letter for you</h2>
              <Heart className="h-5 w-5" />
            </div>
            <div className="space-y-4 text-lg leading-relaxed">
              {letterParagraphs.map((paragraph, index) => (
                <p key={index} className="font-display text-2xl text-foreground md:text-3xl">
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
        </section>
      )}

      <footer className="border-t border-border/60 py-8 text-center text-sm text-muted-foreground">
        <p>{settings.data?.footer_text ?? "Made with love."}</p>
        <p className="mt-2 text-xs">
          <Link to="/admin/login" className="underline underline-offset-2">
            Admin
          </Link>
        </p>
      </footer>

      {randomItem && (
        <Lightbox
          items={[randomItem]}
          index={0}
          onClose={() => setRandomItem(null)}
          onIndex={() => {}}
        />
      )}
    </div>
  );
}
