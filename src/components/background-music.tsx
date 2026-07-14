import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { Music, Volume2, VolumeX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getSignedUrl } from "@/lib/media";

const MUTE_KEY = "birthday-site-music-muted";

export function BackgroundMusic() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const audioRef = useRef<HTMLAudioElement>(null);
  const requestId = useRef(0);
  const resumeAfterVideo = useRef(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [interacted, setInteracted] = useState(false);
  const [muted, setMuted] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(MUTE_KEY) === "true";
  });

  const settings = useQuery({
    queryKey: ["public", "background-music"],
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("music_path,music_enabled")
        .eq("id", 1)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const isAdminPage = pathname.startsWith("/admin");
  const enabled = !!settings.data?.music_enabled && !!settings.data?.music_path;

  const tryPlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || muted || isAdminPage) return;
    try {
      await audio.play();
    } catch {
      // The visitor can always start playback from the visible music button.
    }
  }, [isAdminPage, muted]);

  useEffect(() => {
    const path = settings.data?.music_path;
    const currentRequest = ++requestId.current;
    setAudioUrl(null);

    if (!interacted || muted || !enabled || !path || isAdminPage) return;

    getSignedUrl(path).then((url) => {
      if (requestId.current !== currentRequest) return;
      setAudioUrl(url);
    });
  }, [enabled, interacted, isAdminPage, muted, settings.data?.music_path]);

  useEffect(() => {
    if (!audioUrl || muted || isAdminPage) return;
    void tryPlay();
  }, [audioUrl, isAdminPage, muted, tryPlay]);

  useEffect(() => {
    if (isAdminPage || interacted) return;
    const begin = () => setInteracted(true);
    window.addEventListener("pointerdown", begin, { once: true });
    window.addEventListener("keydown", begin, { once: true });
    return () => {
      window.removeEventListener("pointerdown", begin);
      window.removeEventListener("keydown", begin);
    };
  }, [interacted, isAdminPage]);

  useEffect(() => {
    const onVideoPlay = () => {
      const audio = audioRef.current;
      if (!audio) return;
      resumeAfterVideo.current = !audio.paused && !muted;
      audio.pause();
    };
    const onVideoStop = () => {
      if (!resumeAfterVideo.current) return;
      resumeAfterVideo.current = false;
      void tryPlay();
    };

    window.addEventListener("birthday-memory-video-play", onVideoPlay);
    window.addEventListener("birthday-memory-video-stop", onVideoStop);
    return () => {
      window.removeEventListener("birthday-memory-video-play", onVideoPlay);
      window.removeEventListener("birthday-memory-video-stop", onVideoStop);
    };
  }, [muted, tryPlay]);

  useEffect(() => {
    window.localStorage.setItem(MUTE_KEY, String(muted));
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = muted;
    if (muted) audio.pause();
    else if (interacted) void tryPlay();
  }, [interacted, muted, tryPlay]);

  if (isAdminPage || !enabled) return null;

  const toggle = () => {
    if (!interacted) {
      setInteracted(true);
      setMuted(false);
      return;
    }
    setMuted((value) => !value);
  };

  return (
    <>
      {audioUrl && (
        <audio ref={audioRef} src={audioUrl} loop preload="none" className="hidden" />
      )}
      <button
        type="button"
        onClick={toggle}
        aria-label={muted ? "Play background music" : "Mute background music"}
        className="fixed bottom-4 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-primary/20 bg-background/95 text-primary shadow-lg backdrop-blur transition hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary"
        title={muted ? "Play background music" : "Mute background music"}
      >
        {!interacted ? (
          <Music className="h-5 w-5" />
        ) : muted ? (
          <VolumeX className="h-5 w-5" />
        ) : (
          <Volume2 className="h-5 w-5" />
        )}
      </button>
    </>
  );
}
