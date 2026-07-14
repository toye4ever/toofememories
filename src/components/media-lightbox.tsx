import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSignedUrl } from "@/lib/media";
import { X, ChevronLeft, ChevronRight, RotateCw, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export type LightboxItem = {
  id: string;
  storage_path: string;
  media_type: "image" | "video";
  file_name: string;
  caption: string | null;
};

export function Lightbox({
  items,
  index,
  onClose,
  onIndex,
}: {
  items: LightboxItem[];
  index: number;
  onClose: () => void;
  onIndex: (i: number) => void;
}) {
  const item = items[index];
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoPlaying = useRef(false);
  const requestId = useRef(0);

  const stopVideo = useCallback(() => {
    if (videoPlaying.current && typeof window !== "undefined") {
      videoPlaying.current = false;
      window.dispatchEvent(new Event("birthday-memory-video-stop"));
    }
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.removeAttribute("src");
    video.load();
  }, []);

  const goTo = useCallback(
    (nextIndex: number) => {
      if (items.length === 0) return;
      stopVideo();
      onIndex((nextIndex + items.length) % items.length);
    },
    [items.length, onIndex, stopVideo],
  );

  useEffect(() => {
    const currentRequest = ++requestId.current;
    setUrl(null);
    setError(null);
    setLoading(true);
    stopVideo();

    if (!item?.storage_path) {
      setLoading(false);
      setError("This memory is missing its file information.");
      return;
    }

    getSignedUrl(item.storage_path)
      .then((nextUrl) => {
        if (requestId.current !== currentRequest) return;
        if (!nextUrl) {
          setError("This memory could not be loaded. Please try again.");
          return;
        }
        setUrl(nextUrl);
      })
      .catch((reason: unknown) => {
        if (requestId.current !== currentRequest) return;
        console.error("[lightbox] Failed to load media URL", reason);
        setError("This memory could not be loaded. Please try again.");
      })
      .finally(() => {
        if (requestId.current === currentRequest) setLoading(false);
      });

    return () => {
      if (requestId.current === currentRequest) requestId.current += 1;
      stopVideo();
    };
  }, [item?.id, item?.storage_path, retryKey, stopVideo]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        stopVideo();
        onClose();
      }
      if (event.key === "ArrowRight" && items.length > 1) goTo(index + 1);
      if (event.key === "ArrowLeft" && items.length > 1) goTo(index - 1);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo, index, items.length, onClose, stopVideo]);

  if (!item) return null;

  const close = () => {
    stopVideo();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/95"
      role="dialog"
      aria-modal="true"
      aria-label="Memory viewer"
    >
      <div className="flex items-center justify-between p-3 text-white/90">
        <div className="text-sm" aria-live="polite">
          {index + 1} of {items.length}
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={close}
          className="rounded-full p-2 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-2">
        {items.length > 1 && (
          <button
            type="button"
            aria-label="Previous"
            onClick={() => goTo(index - 1)}
            className="absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/55 p-3 text-white shadow-lg hover:bg-black/75 focus:outline-none focus:ring-2 focus:ring-white md:left-6"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}

        <div className="flex max-h-full max-w-full items-center justify-center px-12 md:px-20">
          {loading ? (
            <div className="flex flex-col items-center gap-3 text-sm text-white/70">
              <LoaderCircle className="h-7 w-7 animate-spin" />
              <span>{item.media_type === "video" ? "Loading video…" : "Loading memory…"}</span>
            </div>
          ) : error ? (
            <div className="max-w-sm rounded-xl bg-white/10 p-6 text-center text-white">
              <p>{error}</p>
              <div className="mt-4 flex justify-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setRetryKey((value) => value + 1)}
                >
                  <RotateCw className="mr-2 h-4 w-4" /> Retry
                </Button>
                <Button type="button" variant="outline" onClick={close}>
                  Close
                </Button>
              </div>
            </div>
          ) : url && item.media_type === "image" ? (
            <img
              src={url}
              alt={item.caption ?? item.file_name}
              className="max-h-[80vh] max-w-[92vw] object-contain"
              decoding="async"
              onError={() => setError("This picture could not be displayed. Please try again.")}
            />
          ) : url ? (
            <video
              key={`${item.id}-${url}`}
              ref={videoRef}
              controls
              playsInline
              preload="metadata"
              className="max-h-[80vh] max-w-[92vw]"
              onCanPlay={(event) => {
                event.currentTarget.play().catch(() => {
                  // Browsers may still require the visitor to press Play.
                });
              }}
              onPlay={() => {
                if (!videoPlaying.current && typeof window !== "undefined") {
                  videoPlaying.current = true;
                  window.dispatchEvent(new Event("birthday-memory-video-play"));
                }
              }}
              onPause={() => {
                if (videoPlaying.current && typeof window !== "undefined") {
                  videoPlaying.current = false;
                  window.dispatchEvent(new Event("birthday-memory-video-stop"));
                }
              }}
              onEnded={() => {
                if (videoPlaying.current && typeof window !== "undefined") {
                  videoPlaying.current = false;
                  window.dispatchEvent(new Event("birthday-memory-video-stop"));
                }
              }}
              onError={() => {
                setError(
                  `This video could not be played in this browser${
                    item.file_name.includes(".")
                      ? ` (.${item.file_name.split(".").pop()?.toLowerCase()})`
                      : ""
                  }.`,
                );
              }}
              src={url}
            >
              Your browser does not support this video.
            </video>
          ) : null}
        </div>

        {items.length > 1 && (
          <button
            type="button"
            aria-label="Next"
            onClick={() => goTo(index + 1)}
            className="absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/55 p-3 text-white shadow-lg hover:bg-black/75 focus:outline-none focus:ring-2 focus:ring-white md:right-6"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>

      {(item.caption || item.media_type === "video") && (
        <div className="p-4 text-center text-sm text-white/90">
          {item.caption ?? ""}
          {item.media_type === "video" && (
            <div className="mt-1 text-xs text-white/60">
              Some MOV and M4V files may require Safari or conversion to MP4.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function useLightbox<T extends LightboxItem>(items: T[]) {
  const [index, setIndex] = useState<number | null>(null);
  const open = (nextIndex: number) => setIndex(nextIndex);
  const close = () => setIndex(null);
  const view = useMemo(() => {
    if (index === null) return null;
    return (
      <Lightbox
        items={items}
        index={index}
        onClose={close}
        onIndex={setIndex}
      />
    );
  }, [index, items]);
  return { open, close, view };
}
