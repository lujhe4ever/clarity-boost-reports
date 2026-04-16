import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ADMIN_EMAIL = "lujhe4ever@gmail.com";
const ADMIN_PASSWORD = "adm321";

export const Route = createFileRoute("/api/setup-admin")({
  server: {
    handlers: {
      GET: async () => {
        // Check if any admin already exists
        const { data: existingAdmins } = await supabaseAdmin
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin")
          .limit(1);

        if (existingAdmins && existingAdmins.length > 0) {
          return Response.json({
            ok: true,
            message: "Admin já existe. Esta rota está desabilitada.",
          });
        }

        // Create admin user
        const { data: created, error: createErr } =
          await supabaseAdmin.auth.admin.createUser({
            email: ADMIN_EMAIL,
            password: ADMIN_PASSWORD,
            email_confirm: true,
            user_metadata: { display_name: "Admin" },
          });

        if (createErr || !created.user) {
          return Response.json(
            { ok: false, error: createErr?.message ?? "Falha" },
            { status: 500 },
          );
        }

        // Assign admin role
        const { error: roleErr } = await supabaseAdmin
          .from("user_roles")
          .insert({ user_id: created.user.id, role: "admin" });

        if (roleErr) {
          return Response.json(
            { ok: false, error: roleErr.message },
            { status: 500 },
          );
        }

        return Response.json({
          ok: true,
          message: `Admin criado: ${ADMIN_EMAIL}`,
        });
      },
    },
  },
});
