import { describe, expect, it } from "vitest";
import { exportPayload, loadState } from "./accounting";
import {
  exportUnifiedPayload,
  importUnifiedPayload,
  UNIFIED_BACKUP_FORMAT,
} from "./backup";
import type { VendorDirectoryState } from "./vendorDirectory";

describe("unified backup contract", () => {
  const vendorDirectory: VendorDirectoryState = {
    version: 1,
    vendors: [
      {
        id: "vendor-1",
        name: "تأمین‌کننده آزمایشی",
        kind: "بازرگانی",
        contactName: "",
        phone: "",
        email: "",
        location: "",
        website: "",
        suppliedMaterials: ["اکسید آلومینیوم"],
        notes: "",
        active: true,
        createdAt: "2026-09-23T00:00:00.000Z",
        updatedAt: "2026-09-23T00:00:00.000Z",
      },
    ],
    quotes: [],
  };

  it("round-trips accounting and vendor directory sections", () => {
    const accounting = loadState();
    const payload = exportUnifiedPayload(accounting, vendorDirectory);
    const parsed = JSON.parse(payload) as {
      format: string;
      sections: unknown;
      currency: { code: string; label: string };
    };

    expect(parsed.format).toBe(UNIFIED_BACKUP_FORMAT);
    expect(parsed.sections).toBeTruthy();
    expect(parsed.currency).toEqual({ code: "IRT", label: "تومان" });

    const restored = importUnifiedPayload(payload);
    expect(restored.unified).toBe(true);
    expect(restored.accounting.settings.businessName).toBe(
      accounting.settings.businessName
    );
    expect(restored.vendorDirectory?.vendors).toHaveLength(1);
    expect(restored.vendorDirectory?.vendors[0].name).toBe(
      "تأمین‌کننده آزمایشی"
    );
  });

  it("does not export local password or PIN credentials", () => {
    const accounting = {
      ...loadState(),
      settings: {
        ...loadState().settings,
        security: {
          password: { salt: "local-salt", hash: "local-password-hash", iterations: 120000 },
          pin: { salt: "local-pin-salt", hash: "local-pin-hash", iterations: 120000 },
        },
      },
    };
    const payload = exportUnifiedPayload(accounting, vendorDirectory);
    expect(payload).not.toContain("local-password-hash");
    expect(payload).not.toContain("local-pin-hash");
    const restored = importUnifiedPayload(payload);
    expect(restored.accounting.settings.security).toBeUndefined();
  });

  it("strips credentials when restoring a legacy backup that already contains them", () => {
    const accounting = {
      ...loadState(),
      settings: {
        ...loadState().settings,
        security: {
          pin: { salt: "old-salt", hash: "old-pin-hash", iterations: 120000 },
        },
      },
    };
    const restored = importUnifiedPayload(exportPayload(accounting));
    expect(restored.unified).toBe(false);
    expect(restored.accounting.settings.security).toBeUndefined();
  });

  it("imports the legacy accounting-only payload without changing vendor data", () => {
    const accounting = loadState();
    const restored = importUnifiedPayload(exportPayload(accounting));

    expect(restored.unified).toBe(false);
    expect(restored.vendorDirectory).toBeUndefined();
    expect(restored.accounting.settings.businessName).toBe(
      accounting.settings.businessName
    );
  });

  it("rejects a payload whose section was changed after export", () => {
    const accounting = loadState();
    const parsed = JSON.parse(
      exportUnifiedPayload(accounting, vendorDirectory)
    ) as {
      sections: {
        vendorDirectory: { data: { vendors: Array<{ name?: string }> } };
      };
    };
    parsed.sections.vendorDirectory.data.vendors[0].name = "دادهٔ دستکاری‌شده";

    expect(() => importUnifiedPayload(JSON.stringify(parsed))).toThrow(
      "checksum"
    );
  });

  it("rejects a payload whose manifest count does not match its data", () => {
    const accounting = loadState();
    const parsed = JSON.parse(exportUnifiedPayload(accounting, vendorDirectory)) as {
      counts: { vendorDirectory: { vendors: number } };
    };
    parsed.counts.vendorDirectory.vendors += 1;

    expect(() => importUnifiedPayload(JSON.stringify(parsed))).toThrow(
      "تعداد تأمین‌کنندگان"
    );
  });
});
