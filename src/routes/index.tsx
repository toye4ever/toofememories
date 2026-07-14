import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSignedUrls } from "@/lib/media";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, Heart, Video as VideoIcon } from "lucide-react";
import { Lightbox, type LightboxItem } from "@/components/media-lightbox";

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

function Home() {
  const settings = useQuery({
    queryKey: ["site_settings"],
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
    queryFn: async () => {
      const { data, error } = await supabase
        .from("albums")
        .select("id,name,slug,description,cover_media_id")
        .eq("is_published", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as Album[];
    },
  });

  const coverIds = useMemo(
    () => (albums.data ?? []).map((a) => a.cover_media_id).filter(Boolean) as string[],
    [albums.data],
  );

  const covers = useQuery({
    queryKey: ["public", "covers", coverIds.sort().join(",")],
    enabled: coverIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media")
        .select("id,storage_path,media_type")
        .in("id", coverIds);
      if (error) throw error;
      const paths = data.map((d) => d.storage_path);
      const urls = await getSignedUrls(paths);
      return data.map((d) => ({ ...d, url: urls[d.storage_path] ?? null }));
    },
  });

  const [randomItem, setRandomItem] = useState<LightboxItem | null>(null);
  const [randomLoading, setRandomLoading] = useState(false);

  async function playRandom() {
    setRandomLoading(true);
    try {
      const { data: pubAlbums, error: aErr } = await supabase
        .from("albums")
        .select("id")
        .eq("is_published", true);
      if (aErr) throw aErr;
      const ids = (pubAlbums ?? []).map((a) => a.id);
      if (ids.length === 0) {
        toast.info("No published videos yet.");
        return;
      }
      const { data, error } = await supabase
        .from("media")
        .select("id,storage_path,media_type,file_name,caption")
        .eq("is_published", true)
        .eq("media_type", "video")
        .in("album_id", ids);
      if (error) throw error;
      if (!data || data.length === 0) {
        toast.info("No published videos yet.");
        return;
      }
      const pick = data[Math.floor(Math.random() * data.length)];
      setRandomItem({
        id: pick.id,
        storage_path: pick.storage_path,
        media_type: pick.media_type as "image" | "video",
        file_name: pick.file_name,
        caption: pick.caption,
      });
    } catch (e) {
      console.error(e);
      toast.error("Couldn't load a random memory.");
    } finally {
      setRandomLoading(false);
    }
  }

  const letterParagraphs = (settings.data?.letter_text ?? "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <div className="min-h-screen">
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-accent/40 via-background to-background" />
        <div className="mx-auto max-w-4xl px-6 pt-16 pb-24 md:pt-28 md:pb-32 text-center">
          <p className="font-display text-2xl text-primary/80 mb-2">A little something for</p>
          <h1 className="font-display text-6xl md:text-8xl text-primary leading-none">
            {settings.data?.hero_title ?? "Happy Birthday, Oluwatoofe"}
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
            {settings.data?.hero_subtitle ?? "A little scrapbook of our memories together."}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <a href="#albums">Open our memories</a>
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={playRandom}
              disabled={randomLoading}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              {randomLoading ? "Finding…" : "Random memory"}
            </Button>
          </div>
        </div>
      </section>

      {/* INTRO */}
      {settings.data?.intro_text && (
        <section className="mx-auto max-w-2xl px-6 py-10 text-center">
          <p className="text-lg leading-relaxed text-foreground/90 whitespace-pre-line">
            {settings.data.intro_text}
          </p>
        </section>
      )}

      {/* ALBUMS */}
      <section id="albums" className="mx-auto max-w-6xl px-6 py-12">
        <div className="text-center mb-10">
          <h2 className="font-display text-5xl text-primary">Our albums</h2>
          <p className="text-muted-foreground mt-1">Little windows into moments we've shared.</p>
        </div>

        {albums.isLoading && <p className="text-center text-muted-foreground">Loading…</p>}

        {albums.data && albums.data.length === 0 && (
          <Card className="max-w-lg mx-auto">
            <CardContent className="py-12 text-center text-muted-foreground">
              The album shelf is still empty — beautiful memories coming soon.
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8">
          {(albums.data ?? []).map((album, i) => {
            const cover = covers.data?.find((c) => c.id === album.cover_media_id);
            const rotate = [-2, 1.5, -1, 2, -1.5, 1][i % 6];
            return (
              <Link
                key={album.id}
                to="/albums/$slug"
                params={{ slug: album.slug }}
                className="group block"
                style={{ transform: `rotate(${rotate}deg)` }}
              >
                <div className="polaroid transition-transform duration-300 group-hover:-translate-y-1 group-hover:rotate-0">
                  <div className="aspect-square bg-muted mb-2 relative overflow-hidden">
                    {cover?.url ? (
                      cover.media_type === "image" ? (
                        <img
                          src={cover.url}
                          alt={album.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <video
                          src={cover.url}
                          className="w-full h-full object-cover"
                          muted
                          playsInline
                          preload="metadata"
                        />
                      )
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                        No cover yet
                      </div>
                    )}
                  </div>
                  <div className="text-center">
                    <p className="font-display text-2xl text-primary leading-tight">{album.name}</p>
                    {album.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
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

      {/* LETTER */}
      {letterParagraphs.length > 0 && (
        <section className="bg-accent/30 py-16 mt-8">
          <div className="mx-auto max-w-2xl px-6">
            <div className="flex items-center justify-center gap-2 mb-6 text-primary">
              <Heart className="h-5 w-5" />
              <h2 className="font-display text-4xl">A letter for you</h2>
              <Heart className="h-5 w-5" />
            </div>
            <div className="space-y-4 text-lg leading-relaxed">
              {letterParagraphs.map((p, i) => (
                <p key={i} className="font-display text-2xl md:text-3xl text-foreground">
                  {p}
                </p>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* FOOTER */}
      <footer className="border-t border-border/60 py-8 text-center text-sm text-muted-foreground">
        <p>{settings.data?.footer_text ?? "Made with love."}</p>
        <p className="text-xs mt-2">
          <Link to="/admin/login" className="underline underline-offset-2">Admin</Link>
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

// Suppress unused import warning
void VideoIcon;
