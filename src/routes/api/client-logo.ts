import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  PUBLIC_SUPABASE_URL,
} from "@/integrations/supabase/publicConfig";
import { resolveHighestRole } from "@/lib/roles";
import {
  CLIENT_LOGO_BUCKET,
  MAX_CLIENT_LOGO_BYTES,
  buildClientLogoPath,
  getManagedClientLogoPath,
  validateClientLogoFile,
} from "@/utils/clientLogo";

const MAX_REQUEST_BYTES = MAX_CLIENT_LOGO_BYTES + 64 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function authorize(request: Request, clientId: string) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return { status: 401 as const };

  const token = authHeader.slice(7);
  const supabaseUrl = process.env.SUPABASE_URL ?? PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return { status: 401 as const };

  const [{ data: roleRows }, { data: profile }] = await Promise.all([
    supabaseAdmin.from("user_roles").select("role").eq("user_id", userData.user.id),
    supabaseAdmin.from("profiles").select("client_id").eq("id", userData.user.id).maybeSingle(),
  ]);
  const role = resolveHighestRole((roleRows ?? []).map((row) => row.role));
  const authorized =
    role === "master_admin" || (role === "admin_cliente" && profile?.client_id === clientId);
  return { status: authorized ? (200 as const) : (403 as const) };
}

async function ensureLogoBucket() {
  const { data } = await supabaseAdmin.storage.getBucket(CLIENT_LOGO_BUCKET);
  const options = {
    public: true,
    fileSizeLimit: MAX_CLIENT_LOGO_BYTES,
    allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
  };

  if (!data) {
    const { error } = await supabaseAdmin.storage.createBucket(CLIENT_LOGO_BUCKET, options);
    if (error && !/already exists/i.test(error.message)) throw error;
    return;
  }

  const { error } = await supabaseAdmin.storage.updateBucket(CLIENT_LOGO_BUCKET, options);
  if (error) throw error;
}

export const Route = createFileRoute("/api/client-logo")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const contentLength = Number(request.headers.get("content-length") ?? 0);
          if (contentLength > MAX_REQUEST_BYTES) {
            return Response.json({ error: "A logo deve ter no maximo 2 MB" }, { status: 413 });
          }

          const formData = await request.formData();
          const clientId = String(formData.get("client_id") ?? "");
          const action = formData.get("action") === "remove" ? "remove" : "upload";
          if (!UUID_PATTERN.test(clientId)) {
            return Response.json({ error: "Cliente invalido" }, { status: 400 });
          }

          const authorization = await authorize(request, clientId);
          if (authorization.status !== 200) {
            return Response.json(
              { error: authorization.status === 401 ? "Unauthorized" : "Forbidden" },
              { status: authorization.status },
            );
          }

          const { data: client, error: clientError } = await supabaseAdmin
            .from("clients")
            .select("id, logo_url")
            .eq("id", clientId)
            .maybeSingle();
          if (clientError) throw clientError;
          if (!client) return Response.json({ error: "Cliente nao encontrado" }, { status: 404 });

          if (action === "remove") {
            const { error } = await supabaseAdmin
              .from("clients")
              .update({ logo_url: null })
              .eq("id", clientId);
            if (error) throw error;

            const oldPath = getManagedClientLogoPath(client.logo_url);
            if (oldPath) await supabaseAdmin.storage.from(CLIENT_LOGO_BUCKET).remove([oldPath]);
            return Response.json({ ok: true, logo_url: null });
          }

          const file = formData.get("file");
          if (!(file instanceof File)) {
            return Response.json({ error: "Arquivo da logo obrigatorio" }, { status: 400 });
          }
          validateClientLogoFile(file);
          await ensureLogoBucket();

          const path = buildClientLogoPath(clientId, file);
          const bytes = await file.arrayBuffer();
          const { error: uploadError } = await supabaseAdmin.storage
            .from(CLIENT_LOGO_BUCKET)
            .upload(path, bytes, { contentType: file.type, cacheControl: "3600", upsert: false });
          if (uploadError) throw uploadError;

          const { data: publicUrl } = supabaseAdmin.storage
            .from(CLIENT_LOGO_BUCKET)
            .getPublicUrl(path);
          const { error: updateError } = await supabaseAdmin
            .from("clients")
            .update({ logo_url: publicUrl.publicUrl })
            .eq("id", clientId);
          if (updateError) {
            await supabaseAdmin.storage.from(CLIENT_LOGO_BUCKET).remove([path]);
            throw updateError;
          }

          const oldPath = getManagedClientLogoPath(client.logo_url);
          if (oldPath && oldPath !== path) {
            await supabaseAdmin.storage.from(CLIENT_LOGO_BUCKET).remove([oldPath]);
          }

          return Response.json({ ok: true, logo_url: publicUrl.publicUrl });
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : "Falha ao salvar logo" },
            { status: 500 },
          );
        }
      },
    },
  },
});
