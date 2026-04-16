import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createClient } from "@supabase/supabase-js";

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
            _role: "admin",
          });
          if (!isAdmin) {
            return Response.json({ error: "Forbidden" }, { status: 403 });
          }

          const { client_id } = await request.json();
          if (!client_id) {
            return Response.json({ error: "client_id obrigatório" }, { status: 400 });
          }

          const { data: client } = await supabaseAdmin
            .from("clients")
            .select("user_id")
            .eq("id", client_id)
            .single();

          await supabaseAdmin.from("clients").delete().eq("id", client_id);

          if (client?.user_id) {
            await supabaseAdmin.auth.admin.deleteUser(client.user_id);
          }

          return Response.json({ ok: true });
        } catch (e: any) {
          return Response.json(
            { error: e?.message ?? "Erro inesperado" },
            { status: 500 },
          );
        }
      },
    },
  },
});
