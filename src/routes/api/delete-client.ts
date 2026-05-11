import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
          if (!isAdmin) {
            return Response.json({ error: "Forbidden" }, { status: 403 });
          }

          const { client_id } = await request.json();
          if (!client_id) {
            return Response.json({ error: "client_id obrigatorio" }, { status: 400 });
          }

          const { data: clientUsers } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("client_id", client_id);

          const userIds = (clientUsers ?? []).map((profile) => profile.id);

          await supabaseAdmin.from("campaigns").delete().eq("client_id", client_id);

          if (userIds.length > 0) {
            await supabaseAdmin.from("user_roles").delete().in("user_id", userIds);
            await supabaseAdmin.from("profiles").delete().in("id", userIds);
          }

          await supabaseAdmin.from("clients").delete().eq("id", client_id);

          for (const userId of userIds) {
            await supabaseAdmin.auth.admin.deleteUser(userId);
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
