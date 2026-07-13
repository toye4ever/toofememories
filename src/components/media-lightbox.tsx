import { useEffect, useMemo, useRef, useState } from "react";
import { getSignedUrl } from "@/lib/media";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

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
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let ignore = false;
    setUrl(null);
    if (item) getSignedUrl(item.storage_path).then((u) => !ignore && setUrl(u));
    return () => {
      ignore = true;
    };
  }, [item]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onIndex((index + 1) % items.length);
      if (e.key === "ArrowLeft") onIndex((index - 1 + items.length) % items.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, items.length, onClose, onIndex]);

  useEffect(() => {
    return () => {
      videoRef.current?.pause();
    };
  }, [item]);

  if (!item) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
      <div className="flex items-center justify-between p-3 text-white/90">
        <div className="text-sm">
          {index + 1} of {items.length}
        </div>
        <button
          aria-label="Close"
          onClick={onClose}
          className="p-2 rounded-full hover:bg-white/10"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="relative flex-1 flex items-center justify-center px-2">
        {items.length > 1 && (
          <button
            aria-label="Previous"
            onClick={() => onIndex((index - 1 + items.length) % items.length)}
            className="absolute left-2 md:left-6 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        <div className="max-h-full max-w-full flex items-center justify-center">
          {!url ? (
            <div className="text-white/60 text-sm">Loading…</div>
          ) : item.media_type === "image" ? (
            <img
              src={url}
              alt={item.caption ?? item.file_name}
              className="max-h-[80vh] max-w-[92vw] object-contain"
            />
          ) : (
            <video
              ref={videoRef}
              src={url}
              controls
              autoPlay
              playsInline
              className="max-h-[80vh] max-w-[92vw]"
              onError={() => {
                /* graceful fallback text below */
              }}
            />
          )}
        </div>
        {items.length > 1 && (
          <button
            aria-label="Next"
            onClick={() => onIndex((index + 1) % items.length)}
            className="absolute right-2 md:right-6 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>
      {(item.caption || item.media_type === "video") && (
        <div className="p-4 text-center text-white/90 text-sm">
          {item.caption ?? ""}
          {item.media_type === "video" && (
            <div className="text-xs text-white/60 mt-1">
              If this video won't play, your browser may not support the .{item.file_name.split(".").pop()} format.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function useLightbox<T extends LightboxItem>(items: T[]) {
  const [index, setIndex] = useState<number | null>(null);
  const open = (i: number) => setIndex(i);
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
