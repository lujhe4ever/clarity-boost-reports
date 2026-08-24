import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getAuthorizationStatus } from "@/lib/serverAccess";

export const Route = createFileRoute("/api/delete-client")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authHeader = request.headers.get("authorization");
          if (!authHeader?.startsWith("Bearer ")) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }
          const token = authHeader.slice(7);

          const SUPABASE_URL = process.env.SUPABASE_URL!;
          const ANON_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;
          const userClient = createClient(SUPABASE_URL, ANON_KEY, {
            global: { headers: { Authorization: `Bearer ${token}` } },
          });
          const { data: userData } = await userClient.auth.getUser();
          if (!userData.user) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }

          const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
            _user_id: userData.user.id,
            _role: "master_admin",
          });
          const callerRole = isAdmin ? "master_admin" : null;
          if (getAuthorizationStatus(true, callerRole, ["master_admin"]) !== 200) {
            return Response.json({ error: "Forbidden" }, { status: 403 });
          }

          const { client_id } = await request.json();
          if (!client_id) {
            return Response.json({ error: "client_id obrigatorio" }, { status: 400 });
          }

          const { data: clientUsers, error: usersError } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("client_id", client_id);
          if (usersError) {
            return Response.json(
              { error: "Falha ao localizar usuarios do cliente" },
              { status: 500 },
            );
          }

          const userIds = (clientUsers ?? []).map((profile) => profile.id);

          const { error: campaignsError } = await supabaseAdmin
            .from("campaigns")
            .delete()
            .eq("client_id", client_id);
          if (campaignsError) {
            return Response.json({ error: "Falha ao excluir campanhas" }, { status: 500 });
          }

          if (userIds.length > 0) {
            const { error: rolesError } = await supabaseAdmin
              .from("user_roles")
              .delete()
              .in("user_id", userIds);
            if (rolesError) {
              return Response.json(
                { error: "Falha ao excluir papeis de usuario" },
                { status: 500 },
              );
            }

            const { error: profilesError } = await supabaseAdmin
              .from("profiles")
              .delete()
              .in("id", userIds);
            if (profilesError) {
              return Response.json({ error: "Falha ao excluir perfis" }, { status: 500 });
            }
          }

          const { error: clientError } = await supabaseAdmin
            .from("clients")
            .delete()
            .eq("id", client_id);
          if (clientError) {
            return Response.json({ error: "Falha ao excluir cliente" }, { status: 500 });
          }

          for (const userId of userIds) {
            const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
            if (authError) {
              return Response.json(
                { error: "Cliente excluido, mas um usuario de autenticacao exige revisao manual" },
                { status: 500 },
              );
            }
          }

          return Response.json({ ok: true });
        } catch (e: unknown) {
          return Response.json(
            { error: e instanceof Error ? e.message : "Erro inesperado" },
            { status: 500 },
          );
        }
      },
    },
  },
});
