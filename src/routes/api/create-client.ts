import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveHighestRole } from "@/lib/roles";
import { getAuthorizationStatus } from "@/lib/serverAccess";

type CallerRole = "master_admin" | "admin_cliente" | "user" | null;

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;

function isAcceptableTemporaryPassword(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= MIN_PASSWORD_LENGTH &&
    value.length <= MAX_PASSWORD_LENGTH &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /\d/.test(value)
  );
}

function isMasterAdmin(role: CallerRole) {
  return role === "master_admin";
}

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

          const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
          const ANON_KEY =
            process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

          if (!SUPABASE_URL || !ANON_KEY) {
            return Response.json(
              {
                error:
                  "Missing Supabase client environment variables. Ensure SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are set.",
              },
              { status: 500 },
            );
          }

          const userClient = createClient(SUPABASE_URL, ANON_KEY, {
            global: { headers: { Authorization: `Bearer ${token}` } },
          });

          const { data: userData } = await userClient.auth.getUser();
          if (!userData.user) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }

          const [{ data: roleRows }, { data: profileData }] = await Promise.all([
            supabaseAdmin.from("user_roles").select("role").eq("user_id", userData.user.id),
            supabaseAdmin
              .from("profiles")
              .select("client_id")
              .eq("id", userData.user.id)
              .maybeSingle(),
          ]);

          const callerRole = resolveHighestRole(
            (roleRows ?? []).map((row) => row.role),
          ) as CallerRole;
          const callerClientId = profileData?.client_id ?? null;

          const body = await request.json();
          const mode = body.mode === "create_user" ? "create_user" : "create_client";

          if (mode === "create_client") {
            if (getAuthorizationStatus(true, callerRole, ["master_admin"]) !== 200) {
              return Response.json({ error: "Forbidden" }, { status: 403 });
            }

            const {
              email,
              password,
              company_name,
              contact_name,
              primary_color,
              secondary_color,
              logo_url,
              dashboard_message,
            } = body;

            if (!email || !password || !company_name) {
              return Response.json({ error: "Campos obrigatorios faltando" }, { status: 400 });
            }

            if (!isAcceptableTemporaryPassword(password)) {
              return Response.json(
                {
                  error:
                    "Senha deve ter entre 12 e 128 caracteres, com maiuscula, minuscula e numero",
                },
                { status: 400 },
              );
            }

            const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
              email,
              password,
              email_confirm: true,
              user_metadata: { display_name: contact_name || company_name },
            });

            if (createErr || !created.user) {
              return Response.json(
                { error: createErr?.message ?? "Falha ao criar usuario" },
                { status: 400 },
              );
            }

            const { data: client, error: clientErr } = await supabaseAdmin
              .from("clients")
              .insert({
                user_id: created.user.id,
                company_name,
                contact_name: contact_name || null,
                primary_color: primary_color || "#0f766e",
                secondary_color: secondary_color || "#0891b2",
                logo_url: logo_url || null,
                dashboard_message: dashboard_message || null,
              })
              .select()
              .single();

            if (clientErr || !client) {
              await supabaseAdmin.auth.admin.deleteUser(created.user.id);
              return Response.json(
                { error: clientErr?.message ?? "Falha ao criar cliente" },
                { status: 500 },
              );
            }

            const [{ error: roleErr }, { error: profileErr }] = await Promise.all([
              supabaseAdmin
                .from("user_roles")
                .insert({ user_id: created.user.id, role: "admin_cliente" }),
              supabaseAdmin
                .from("profiles")
                .upsert({
                  id: created.user.id,
                  email,
                  display_name: contact_name || company_name,
                  client_id: client.id,
                })
                .select(),
            ]);

            if (roleErr || profileErr) {
              await supabaseAdmin.from("clients").delete().eq("id", client.id);
              await supabaseAdmin.auth.admin.deleteUser(created.user.id);
              return Response.json(
                {
                  error:
                    roleErr?.message ??
                    profileErr?.message ??
                    "Falha ao finalizar cadastro do cliente",
                },
                { status: 500 },
              );
            }

            return Response.json({ ok: true, client });
          }

          if (getAuthorizationStatus(true, callerRole, ["master_admin", "admin_cliente"]) !== 200) {
            return Response.json({ error: "Forbidden" }, { status: 403 });
          }

          const { email, password, display_name, client_id, role } = body;

          if (!email || !password || !display_name) {
            return Response.json({ error: "Campos obrigatorios faltando" }, { status: 400 });
          }

          if (!isAcceptableTemporaryPassword(password)) {
            return Response.json(
              {
                error:
                  "Senha deve ter entre 12 e 128 caracteres, com maiuscula, minuscula e numero",
              },
              { status: 400 },
            );
          }

          const targetClientId = isMasterAdmin(callerRole) ? client_id : callerClientId;

          if (!targetClientId) {
            return Response.json({ error: "Cliente de destino nao encontrado" }, { status: 400 });
          }

          const targetRole =
            isMasterAdmin(callerRole) && role === "admin_cliente" ? "admin_cliente" : "user";

          const { data: createdUser, error: createdUserErr } =
            await supabaseAdmin.auth.admin.createUser({
              email,
              password,
              email_confirm: true,
              user_metadata: { display_name },
            });

          if (createdUserErr || !createdUser.user) {
            return Response.json(
              { error: createdUserErr?.message ?? "Falha ao criar usuario" },
              { status: 400 },
            );
          }

          const [{ error: roleErr }, { error: profileErr }] = await Promise.all([
            supabaseAdmin
              .from("user_roles")
              .insert({ user_id: createdUser.user.id, role: targetRole }),
            supabaseAdmin
              .from("profiles")
              .upsert({
                id: createdUser.user.id,
                email,
                display_name,
                client_id: targetClientId,
              })
              .select(),
          ]);

          if (roleErr || profileErr) {
            await supabaseAdmin.auth.admin.deleteUser(createdUser.user.id);
            return Response.json(
              {
                error:
                  roleErr?.message ??
                  profileErr?.message ??
                  "Falha ao finalizar cadastro do usuario",
              },
              { status: 500 },
            );
          }

          return Response.json({
            ok: true,
            user: {
              id: createdUser.user.id,
              email,
              display_name,
              role: targetRole,
              client_id: targetClientId,
            },
          });
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
