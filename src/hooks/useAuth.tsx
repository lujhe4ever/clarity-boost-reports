import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import {
  canManageClients,
  isClientAdmin,
  isMasterAdmin,
  resolveHighestRole,
  type AppRole,
} from "@/lib/roles";

export type Role = AppRole;

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up listener FIRST
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        setLoading(true);
        setTimeout(() => {
          loadAccess(sess.user.id).finally(() => setLoading(false));
        }, 0);
      } else {
        setRole(null);
        setClientId(null);
        setLoading(false);
      }
    });

    // Then check existing session
    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        loadAccess(sess.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function loadAccess(userId: string) {
    const [{ data: roleRows }, { data: profileData }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("profiles").select("client_id").eq("id", userId).maybeSingle(),
    ]);

    setRole(resolveHighestRole((roleRows ?? []).map((row) => row.role)));
    setClientId(profileData?.client_id ?? null);
  }

  return {
    session,
    user,
    role,
    clientId,
    loading,
    isMasterAdmin: isMasterAdmin(role),
    isClientAdmin: isClientAdmin(role),
    canManageClients: canManageClients(role),
  };
}
