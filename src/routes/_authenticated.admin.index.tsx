import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Images, Upload, Settings as SettingsIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: Dashboard,
});

function Dashboard() {
  const { data: counts } = useQuery({
    queryKey: ["admin-counts"],
    queryFn: async () => {
      const [albums, media, published] = await Promise.all([
        supabase.from("albums").select("*", { count: "exact", head: true }),
        supabase.from("media").select("*", { count: "exact", head: true }),
        supabase
          .from("albums")
          .select("*", { count: "exact", head: true })
          .eq("is_published", true),
      ]);
      return {
        albums: albums.count ?? 0,
        media: media.count ?? 0,
        published: published.count ?? 0,
      };
    },
  });

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-4xl md:text-5xl text-primary">Dashboard</h1>
        <p className="text-muted-foreground">
          A quick look at your birthday scrapbook.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Albums</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-5xl text-primary">{counts?.albums ?? "–"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Media files</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-5xl text-primary">{counts?.media ?? "–"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Published albums</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-5xl text-primary">{counts?.published ?? "–"}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload a folder
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Drag in a folder or pick one. Its name becomes the album name.
            </p>
            <Button asChild><Link to="/admin/upload">Go to upload</Link></Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Images className="h-5 w-5" />
              Manage albums
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Rename, publish, reorder, or delete albums.
            </p>
            <Button asChild variant="outline"><Link to="/admin/albums">Manage</Link></Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SettingsIcon className="h-5 w-5" />
              Edit the letter
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Update hero, intro, letter, and footer text.
            </p>
            <Button asChild variant="outline"><Link to="/admin/settings">Settings</Link></Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
