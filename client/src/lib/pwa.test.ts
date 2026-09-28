import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const publicDir = resolve(process.cwd(), "client", "public");
const manifestPath = resolve(publicDir, "manifest.webmanifest");
const serviceWorkerPath = resolve(publicDir, "sw.js");

describe("PWA delivery contract", () => {
  it("declares an RTL standalone install manifest with versioned icons", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      name: string;
      short_name: string;
      lang: string;
      dir: string;
      start_url: string;
      scope: string;
      display: string;
      icons: Array<{ src: string; sizes: string; type: string }>;
    };
    expect(manifest.name).toContain("حسابداری");
    expect(manifest.short_name).toContain("کارگاه");
    expect(manifest.lang).toBe("fa");
    expect(manifest.dir).toBe("rtl");
    expect(manifest.start_url).toBe("./");
    expect(manifest.scope).toBe("./");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sizes: "192x192", src: "./icon-192.svg" }),
        expect.objectContaining({ sizes: "512x512", src: "./icon-512.svg" }),
      ])
    );
  });

  it("keeps the service worker cache versioned and limited to same-origin app assets", () => {
    const serviceWorker = readFileSync(serviceWorkerPath, "utf8");
    expect(serviceWorker).toMatch(/CACHE_NAME\s*=\s*["']accounting-workshop-pwa-aistudio-v\d+["']/);
    expect(serviceWorker).toContain("self.registration.scope");
    expect(serviceWorker).toContain("event.request.method !== \"GET\"");
    expect(serviceWorker).toContain("event.request.mode === \"navigate\"");
    expect(serviceWorker).toContain("new URL(event.request.url).origin === self.location.origin");
    expect(serviceWorker).toContain(".catch(() => Response.error())");
    expect((serviceWorker.match(/caches\.match\(BASE\)/g) || []).length).toBe(1);
    expect(serviceWorker).not.toMatch(/localStorage|indexedDB|cashEvents|invoices|purchasePayments|checks/);
  });

  it("provides both declared install icons as real files", () => {
    expect(readFileSync(resolve(publicDir, "icon-192.svg"), "utf8")).toContain("<svg");
    expect(readFileSync(resolve(publicDir, "icon-512.svg"), "utf8")).toContain("<svg");
  });
});
