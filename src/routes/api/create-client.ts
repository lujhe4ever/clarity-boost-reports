import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createClient } from "@supabase/supabase-js";

// Validates the requesting user is an admin, then creates a client user + record
export const Route = createFileRoute("/api/create-client")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authHeader = request.headers.get("authorization");
          if (!authHeader?.startsWith("Bearer ")) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }
          const token = authHeader.slice(7);

          // Validate caller
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

          const body = await request.json();
          const { email, password, company_name, contact_name } = body;

          if (!email || !password || !company_name) {
            return Response.json(
              { error: "Campos obrigatórios faltando" },
              { status: 400 },
            );
          }
          if (password.length < 6) {
            return Response.json(
              { error: "Senha deve ter ao menos 6 caracteres" },
              { status: 400 },
            );
          }

          const { data: created, error: createErr } =
            await supabaseAdmin.auth.admin.createUser({
              email,
              password,
              email_confirm: true,
              user_metadata: { display_name: contact_name || company_name },
            });

          if (createErr || !created.user) {
            return Response.json(
              { error: createErr?.message ?? "Falha ao criar usuário" },
              { status: 400 },
            );
          }

          await supabaseAdmin
            .from("user_roles")
            .insert({ user_id: created.user.id, role: "client" });

          const { data: client, error: clientErr } = await supabaseAdmin
            .from("clients")
            .insert({
              user_id: created.user.id,
              company_name,
              contact_name: contact_name || null,
            })
            .select()
            .single();

          if (clientErr) {
            return Response.json({ error: clientErr.message }, { status: 500 });
          }

          return Response.json({ ok: true, client });
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
