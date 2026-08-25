export const CLIENT_LOGO_BUCKET = "client-logos";
export const MAX_CLIENT_LOGO_BYTES = 2 * 1024 * 1024;

const ALLOWED_LOGO_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const;

type ClientLogoFile = Pick<File, "name" | "size" | "type">;

export function validateClientLogoFile(file: ClientLogoFile) {
  if (!(file.type in ALLOWED_LOGO_TYPES)) {
    throw new Error("Use uma imagem PNG, JPEG ou WebP");
  }
  if (file.size <= 0 || file.size > MAX_CLIENT_LOGO_BYTES) {
    throw new Error("A logo deve ter no maximo 2 MB");
  }
  return ALLOWED_LOGO_TYPES[file.type as keyof typeof ALLOWED_LOGO_TYPES];
}

export function buildClientLogoPath(clientId: string, file: ClientLogoFile) {
  const extension = validateClientLogoFile(file);
  return `${clientId}/logo-${crypto.randomUUID()}.${extension}`;
}

export function getManagedClientLogoPath(url: string | null | undefined) {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${CLIENT_LOGO_BUCKET}/`;
  const markerIndex = url.indexOf(marker);
  if (markerIndex < 0) return null;

  try {
    return decodeURIComponent(url.slice(markerIndex + marker.length));
  } catch {
    return null;
  }
}
