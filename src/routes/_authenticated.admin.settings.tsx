import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Music, Trash2, Upload } from "lucide-react";
import { safeFileName } from "@/lib/slug";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: SettingsPage,
});

type Settings = {
  hero_title: string;
  hero_subtitle: string;
  intro_text: string;
  letter_text: string;
  footer_text: string;
  music_path: string | null;
  music_enabled: boolean;
};

function SettingsPage() {
  const queryClient = useQueryClient();
  const audioInput = useRef<HTMLInputElement>(null);
  const [uploadingMusic, setUploadingMusic] = useState(false);

  const { data, isLoading, error: loadError } = useQuery({
    queryKey: ["admin", "site_settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select(
          "hero_title,hero_subtitle,intro_text,letter_text,footer_text,music_path,music_enabled",
        )
        .eq("id", 1)
        .single();
      if (error) throw error;
      return data as Settings;
    },
  });

  const [form, setForm] = useState<Settings | null>(null);
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const refreshSettings = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin", "site_settings"] }),
      queryClient.invalidateQueries({ queryKey: ["site_settings"] }),
      queryClient.invalidateQueries({ queryKey: ["public", "background-music"] }),
    ]);
  };

  const save = useMutation({
    mutationFn: async (next: Settings) => {
      const { error } = await supabase.from("site_settings").update(next).eq("id", 1);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Saved");
      await refreshSettings();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function uploadMusic(file: File) {
    const extension = file.name.toLowerCase().split(".").pop() ?? "";
    if (!["mp3", "m4a", "wav", "ogg"].includes(extension)) {
      toast.error("Use an MP3, M4A, WAV, or OGG audio file.");
      return;
    }

    setUploadingMusic(true);
    const previousPath = form?.music_path ?? null;
    const path = `music/${crypto.randomUUID()}-${safeFileName(file.name)}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from("birthday-media")
        .upload(path, file, {
          contentType: file.type || undefined,
          cacheControl: "31536000",
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const { error: updateError } = await supabase
        .from("site_settings")
        .update({ music_path: path, music_enabled: true })
        .eq("id", 1);
      if (updateError) {
        await supabase.storage.from("birthday-media").remove([path]);
        throw updateError;
      }

      if (previousPath && previousPath !== path) {
        await supabase.storage.from("birthday-media").remove([previousPath]);
      }

      setForm((current) =>
        current ? { ...current, music_path: path, music_enabled: true } : current,
      );
      await refreshSettings();
      toast.success("Background song uploaded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The song could not be uploaded.");
    } finally {
      setUploadingMusic(false);
      if (audioInput.current) audioInput.current.value = "";
    }
  }

  async function removeMusic() {
    if (!form?.music_path) return;
    const oldPath = form.music_path;
    setUploadingMusic(true);
    try {
      const { error } = await supabase
        .from("site_settings")
        .update({ music_path: null, music_enabled: false })
        .eq("id", 1);
      if (error) throw error;
      await supabase.storage.from("birthday-media").remove([oldPath]);
      setForm((current) =>
        current ? { ...current, music_path: null, music_enabled: false } : current,
      );
      await refreshSettings();
      toast.success("Background song removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The song could not be removed.");
    } finally {
      setUploadingMusic(false);
    }
  }

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (loadError) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="font-medium">Settings could not be loaded.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Run SUPABASE_HOTFIX.sql in the Lovable Cloud SQL Editor, then refresh this page.
          </p>
          <p className="mt-2 break-all text-xs text-destructive">
            {loadError instanceof Error ? loadError.message : "Unknown error"}
          </p>
        </CardContent>
      </Card>
    );
  }
  if (!form) return <p className="text-muted-foreground">No settings row was found.</p>;

  const updateText = (
    key: "hero_title" | "hero_subtitle" | "intro_text" | "letter_text" | "footer_text",
    value: string,
  ) => setForm((current) => (current ? { ...current, [key]: value } : current));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-4xl text-primary">Site content</h1>
        <p className="text-muted-foreground">Edit the message and background music.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Hero</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="hero_title">Title</Label>
            <Input
              id="hero_title"
              value={form.hero_title}
              onChange={(event) => updateText("hero_title", event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="hero_subtitle">Subtitle</Label>
            <Input
              id="hero_subtitle"
              value={form.hero_subtitle}
              onChange={(event) => updateText("hero_subtitle", event.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Introduction</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={4}
            value={form.intro_text}
            onChange={(event) => updateText("intro_text", event.target.value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Heartfelt letter</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={10}
            value={form.letter_text}
            onChange={(event) => updateText("letter_text", event.target.value)}
            placeholder="Separate paragraphs with a blank line."
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Blank lines create new paragraphs on the site.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Music className="h-5 w-5" /> Background music
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <div>
              <Label htmlFor="music-enabled">Enable background music</Label>
              <p className="text-xs text-muted-foreground">
                Visitors can mute it. Playback begins after their first interaction.
              </p>
            </div>
            <Switch
              id="music-enabled"
              checked={form.music_enabled}
              disabled={!form.music_path || uploadingMusic}
              onCheckedChange={(checked) =>
                setForm((current) =>
                  current ? { ...current, music_enabled: checked } : current,
                )
              }
            />
          </div>

          <input
            ref={audioInput}
            type="file"
            accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/ogg,.mp3,.m4a,.wav,.ogg"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadMusic(file);
            }}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={uploadingMusic}
              onClick={() => audioInput.current?.click()}
            >
              <Upload className="mr-2 h-4 w-4" />
              {uploadingMusic ? "Uploading…" : form.music_path ? "Replace song" : "Upload song"}
            </Button>
            {form.music_path && (
              <Button
                type="button"
                variant="destructive"
                disabled={uploadingMusic}
                onClick={() => void removeMusic()}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Remove song
              </Button>
            )}
          </div>
          <p className="break-all text-xs text-muted-foreground">
            {form.music_path ? `Current file: ${form.music_path.split("/").pop()}` : "No song uploaded."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Footer</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            value={form.footer_text}
            onChange={(event) => updateText("footer_text", event.target.value)}
          />
        </CardContent>
      </Card>

      <div className="sticky bottom-0 flex justify-end gap-2 bg-background/80 py-3 backdrop-blur">
        <Button variant="ghost" onClick={() => data && setForm(data)}>
          Reset
        </Button>
        <Button onClick={() => save.mutate(form)} disabled={save.isPending || uploadingMusic}>
          {save.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
