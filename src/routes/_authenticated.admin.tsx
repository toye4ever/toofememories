import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import {
  Home,
  Images,
  Upload,
  Settings as SettingsIcon,
  LogOut,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  component: AdminLayout,
});

const nav = [
  { to: "/admin", label: "Dashboard", icon: Home, exact: true },
  { to: "/admin/albums", label: "Albums", icon: Images, exact: false },
  { to: "/admin/upload", label: "Upload", icon: Upload, exact: false },
  { to: "/admin/settings", label: "Settings", icon: SettingsIcon, exact: false },
] as const;

function AdminLayout() {
  const { isAdmin, checking } = useIsAdmin();
  const { user } = useSession();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!checking && user && !isAdmin) {
      toast.error("Your account isn't an administrator.");
    }
  }, [checking, isAdmin, user]);

  async function signOut() {
    await supabase.auth.signOut();
    queryClient.removeQueries({
      predicate: (query) => {
        const first = query.queryKey[0];
        return first === "admin" || first === "is-admin";
      },
    });
    await queryClient.invalidateQueries({ queryKey: ["public"] });
    await queryClient.invalidateQueries({ queryKey: ["site_settings"] });
    navigate({ to: "/", replace: true });
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Checking permissions…
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md text-center space-y-4">
          <h1 className="font-display text-4xl text-primary">Not authorized</h1>
          <p className="text-muted-foreground">
            This account exists but doesn't have administrator access. See{" "}
            <code>SETUP.md</code> for how to grant the admin role.
          </p>
          <div className="flex justify-center gap-2">
            <Button variant="outline" onClick={signOut}>Sign out</Button>
            <Button asChild variant="ghost">
              <Link to="/">Back to site</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-7xl flex-col md:flex-row">
        <aside className="md:sticky md:top-0 md:h-screen w-full md:w-64 border-b md:border-b-0 md:border-r border-border/60 bg-sidebar text-sidebar-foreground p-4 md:p-6 flex md:flex-col gap-4">
          <div className="flex md:block items-center gap-3 md:gap-0">
            <Link to="/" className="font-display text-2xl md:text-3xl text-primary">
              Toofe · Admin
            </Link>
            <p className="hidden md:block mt-1 text-xs text-muted-foreground truncate">
              {user?.email}
            </p>
          </div>
          <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible flex-1">
            {nav.map((item) => {
              const active = item.exact
                ? pathname === item.to
                : pathname.startsWith(item.to);
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="hidden md:flex flex-col gap-2 pt-4 border-t border-border/60">
            <Button asChild variant="ghost" size="sm">
              <Link to="/">
                <ExternalLink className="h-4 w-4 mr-2" />
                View site
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Sign out
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={signOut} className="md:hidden ml-auto">
            <LogOut className="h-4 w-4" />
          </Button>
        </aside>
        <main className="flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
