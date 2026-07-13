import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: SettingsPage,
});

type Settings = {
  hero_title: string;
  hero_subtitle: string;
  intro_text: string;
  letter_text: string;
  footer_text: string;
};

function SettingsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "site_settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("hero_title,hero_subtitle,intro_text,letter_text,footer_text")
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

  const save = useMutation({
    mutationFn: async (next: Settings) => {
      const { error } = await supabase.from("site_settings").update(next).eq("id", 1);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["admin", "site_settings"] });
      qc.invalidateQueries({ queryKey: ["site_settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !form) return <p className="text-muted-foreground">Loading…</p>;

  const update = (key: keyof Settings, value: string) => setForm((f) => (f ? { ...f, [key]: value } : f));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-4xl text-primary">Site content</h1>
        <p className="text-muted-foreground">Edit hero copy, intro, letter, and footer.</p>
      </header>

      <Card>
        <CardHeader><CardTitle>Hero</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="hero_title">Title</Label>
            <Input id="hero_title" value={form.hero_title} onChange={(e) => update("hero_title", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="hero_subtitle">Subtitle</Label>
            <Input id="hero_subtitle" value={form.hero_subtitle} onChange={(e) => update("hero_subtitle", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Introduction</CardTitle></CardHeader>
        <CardContent>
          <Textarea
            rows={4}
            value={form.intro_text}
            onChange={(e) => update("intro_text", e.target.value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Heartfelt letter</CardTitle></CardHeader>
        <CardContent>
          <Textarea
            rows={10}
            value={form.letter_text}
            onChange={(e) => update("letter_text", e.target.value)}
            placeholder="Separate paragraphs with a blank line."
          />
          <p className="text-xs text-muted-foreground mt-2">
            Blank lines create new paragraphs on the site.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Footer</CardTitle></CardHeader>
        <CardContent>
          <Input value={form.footer_text} onChange={(e) => update("footer_text", e.target.value)} />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2 sticky bottom-0 py-3 bg-background/80 backdrop-blur">
        <Button
          variant="ghost"
          onClick={() => {
            if (data) setForm(data);
          }}
        >
          Reset
        </Button>
        <Button onClick={() => save.mutate(form)} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
