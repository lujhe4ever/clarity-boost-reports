import { describe, expect, it } from "vitest";

import {
  MAX_CLIENT_LOGO_BYTES,
  getManagedClientLogoPath,
  validateClientLogoFile,
} from "@/utils/clientLogo";

describe("client logo validation", () => {
  it("accepts bounded raster images", () => {
    expect(validateClientLogoFile({ name: "logo.png", size: 1024, type: "image/png" })).toBe("png");
    expect(validateClientLogoFile({ name: "logo.webp", size: 1024, type: "image/webp" })).toBe(
      "webp",
    );
  });

  it("rejects SVG and oversized images", () => {
    expect(() =>
      validateClientLogoFile({ name: "logo.svg", size: 1024, type: "image/svg+xml" }),
    ).toThrow(/PNG, JPEG ou WebP/);
    expect(() =>
      validateClientLogoFile({
        name: "large.jpg",
        size: MAX_CLIENT_LOGO_BYTES + 1,
        type: "image/jpeg",
      }),
    ).toThrow(/2 MB/);
  });

  it("extracts only managed storage paths", () => {
    expect(
      getManagedClientLogoPath(
        "https://project.supabase.co/storage/v1/object/public/client-logos/client-a/logo.webp",
      ),
    ).toBe("client-a/logo.webp");
    expect(getManagedClientLogoPath("https://example.com/logo.webp")).toBeNull();
  });
});
