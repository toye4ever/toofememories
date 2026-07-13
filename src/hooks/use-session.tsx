import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

type SessionState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
};

const SessionContext = createContext<SessionState>({
  session: null,
  user: null,
  loading: true,
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({
    session: null,
    user: null,
    loading: true,
  });
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setState({
        session: data.session,
        user: data.session?.user ?? null,
        loading: false,
      });
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        event !== "SIGNED_IN" &&
        event !== "SIGNED_OUT" &&
        event !== "USER_UPDATED"
      )
        return;
      setState({ session, user: session?.user ?? null, loading: false });
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [router, queryClient]);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}
