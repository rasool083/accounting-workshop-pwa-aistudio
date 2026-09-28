import {
  exportPayload,
  importPayload,
  type AppState,
} from "./accounting";
import {
  exportVendorDirectory,
  importVendorDirectory,
  type VendorDirectoryState,
} from "./vendorDirectory";

export const UNIFIED_BACKUP_FORMAT = "accounting-workshop-pwa-aistudio-unified-backup-v1";
export const LEGACY_UNIFIED_BACKUP_FORMAT = "accounting-workshop-unified-backup-v1";

export type UnifiedBackupEnvelope = {
  format: typeof UNIFIED_BACKUP_FORMAT | typeof LEGACY_UNIFIED_BACKUP_FORMAT;
  backupId: string;
  createdAt: string;
  application: "حسابداری کارگاه";
  currency: { code: string; label: string };
  sections: {
    accounting: Record<string, unknown>;
    vendorDirectory: Record<string, unknown>;
  };
  counts: {
    accounting: Record<string, number>;
    vendorDirectory: { vendors: number; quotes: number };
  };
  checksums: {
    accounting: string;
    vendorDirectory: string;
  };
};

export type ImportedBackup = {
  accounting: AppState;
  vendorDirectory?: VendorDirectoryState;
  unified: boolean;
};

function createBackupId() {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `backup-${random}`;
}

function parseJsonObject(payload: string) {
  const parsed: unknown = JSON.parse(payload);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("ساختار فایل پشتیبان معتبر نیست");
  }
  return parsed as Record<string, unknown>;
}

function countVendorDirectory(directory: VendorDirectoryState) {
  return {
    vendors: directory.vendors.length,
    quotes: directory.quotes.length,
  };
}

/** A deterministic integrity marker; this is not encryption or authentication. */
export function checksumJson(value: unknown) {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

const RESTORE_SNAPSHOT_KEY = "accounting-workshop-pwa-aistudio:restore-snapshots:v1";

export type RestoreSnapshot = {
  id: string;
  createdAt: string;
  payload: string;
  size: number;
};

function stripLocalSecurity(accounting: AppState): AppState {
  return {
    ...accounting,
    settings: { ...accounting.settings, security: undefined },
  };
}

export function listRestoreSnapshots(): RestoreSnapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(RESTORE_SNAPSHOT_KEY) || "[]"
    );
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        item =>
          item &&
          typeof item === "object" &&
          typeof item.id === "string" &&
          typeof item.createdAt === "string" &&
          typeof item.payload === "string"
      )
      .map(item => ({
        id: item.id,
        createdAt: item.createdAt,
        payload: item.payload,
        size: item.payload.length,
      }));
  } catch {
    return [];
  }
}

/** Keep a short local rollback trail; this is intentionally not uploaded automatically. */
export function saveRestoreSnapshot(payload: string) {
  if (typeof window === "undefined") return;
  try {
    const existing = JSON.parse(
      localStorage.getItem(RESTORE_SNAPSHOT_KEY) || "[]"
    );
    const snapshots = Array.isArray(existing) ? existing : [];
    localStorage.setItem(
      RESTORE_SNAPSHOT_KEY,
      JSON.stringify(
        [
          { id: createBackupId(), createdAt: new Date().toISOString(), payload },
          ...snapshots,
        ].slice(0, 3)
      )
    );
  } catch {
    // A blocked or full localStorage must not make a valid restore impossible.
  }
}

export function deleteRestoreSnapshot(id: string) {
  if (typeof window === "undefined") return;
  const next = listRestoreSnapshots().filter(snapshot => snapshot.id !== id);
  localStorage.setItem(RESTORE_SNAPSHOT_KEY, JSON.stringify(next));
}

function assertCollectionCounts(
  data: unknown,
  expected: Record<string, number>
) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("دادهٔ بخش backup ساختار مجموعه‌ای ندارد");
  }
  const record = data as Record<string, unknown>;
  for (const [key, count] of Object.entries(expected)) {
    if (typeof count !== "number") continue;
    const actual = record[key];
    if (Array.isArray(actual) && actual.length !== count) {
      throw new Error(`تعداد رکوردهای ${key} با manifest backup مطابقت ندارد`);
    }
  }
}

export function exportUnifiedPayload(
  accounting: AppState,
  vendorDirectory: VendorDirectoryState
) {
  // Password/PIN are local-device controls, not business data. Never export
  // their hashes into a portable backup or transfer the lock to another device.
  const accountingForBackup: AppState = {
    ...accounting,
    settings: { ...accounting.settings, security: undefined },
  };
  const accountingPayload = parseJsonObject(exportPayload(accountingForBackup));
  const vendorPayload = parseJsonObject(exportVendorDirectory(vendorDirectory));
  const accountingData = accountingPayload.data;
  const vendorData = vendorPayload.data;
  const accountingCollections = accountingPayload.collections;

  if (
    !accountingData || typeof accountingData !== "object" ||
    !vendorData || typeof vendorData !== "object"
  ) {
    throw new Error("ساختار داخلی backup برای ترکیب معتبر نیست");
  }

  const accountingSection = {
    format: accountingPayload.format,
    backupFormatVersion: accountingPayload.backupFormatVersion,
    schemaVersion: accountingPayload.schemaVersion,
    exportedAt: accountingPayload.exportedAt,
    collections: accountingCollections,
    data: accountingData,
  };
  const vendorSection = {
    format: vendorPayload.format,
    exportedAt: vendorPayload.exportedAt,
    data: vendorData,
  };

  const envelope: UnifiedBackupEnvelope = {
    format: UNIFIED_BACKUP_FORMAT,
    backupId: createBackupId(),
    createdAt: new Date().toISOString(),
    application: "حسابداری کارگاه",
    currency: {
      code:
        accounting.settings.currencyCode ||
        (accounting.settings.currency === "ریال" ? "IRR" : "IRT"),
      label: accounting.settings.currency,
    },
    sections: {
      accounting: accountingSection,
      vendorDirectory: vendorSection,
    },
    counts: {
      accounting: (accountingCollections || {}) as Record<string, number>,
      vendorDirectory: countVendorDirectory(vendorDirectory),
    },
    checksums: {
      accounting: checksumJson(accountingSection),
      vendorDirectory: checksumJson(vendorSection),
    },
  };

  return JSON.stringify(envelope, null, 2);
}

export function importUnifiedPayload(payload: string): ImportedBackup {
  const parsed = parseJsonObject(payload);
  if (parsed.format !== UNIFIED_BACKUP_FORMAT && parsed.format !== LEGACY_UNIFIED_BACKUP_FORMAT) {
    return {
      accounting: stripLocalSecurity(importPayload(payload)),
      unified: false,
    };
  }

  const sections = parsed.sections;
  if (!sections || typeof sections !== "object" || Array.isArray(sections)) {
    throw new Error("بخش‌های backup یکپارچه ناقص است");
  }
  const sectionRecord = sections as Record<string, unknown>;
  const accountingSection = sectionRecord.accounting;
  const vendorSection = sectionRecord.vendorDirectory;
  if (
    !accountingSection || typeof accountingSection !== "object" ||
    !vendorSection || typeof vendorSection !== "object"
  ) {
    throw new Error("بخش حسابداری یا تأمین‌کنندگان در backup وجود ندارد");
  }

  const counts = parsed.counts;
  if (!counts || typeof counts !== "object" || Array.isArray(counts)) {
    throw new Error("manifest شمارنده‌های backup وجود ندارد");
  }
  const countRecord = counts as Record<string, unknown>;
  const accountingCounts = countRecord.accounting;
  const vendorCounts = countRecord.vendorDirectory;
  if (
    !accountingCounts || typeof accountingCounts !== "object" || Array.isArray(accountingCounts) ||
    !vendorCounts || typeof vendorCounts !== "object" || Array.isArray(vendorCounts)
  ) {
    throw new Error("manifest شمارنده‌های backup ناقص است");
  }

  const accountingRecord = accountingSection as Record<string, unknown>;
  const vendorRecord = vendorSection as Record<string, unknown>;
  assertCollectionCounts(
    accountingRecord.data,
    accountingCounts as Record<string, number>
  );
  const vendorData = vendorRecord.data as Record<string, unknown> | undefined;
  if (!vendorData || typeof vendorData !== "object" || Array.isArray(vendorData)) {
    throw new Error("دادهٔ دفتر تأمین‌کنندگان در backup ناقص است");
  }
  const vendorCountRecord = vendorCounts as Record<string, unknown>;
  if (
    !Array.isArray(vendorData.vendors) ||
    vendorData.vendors.length !== vendorCountRecord.vendors
  ) {
    throw new Error("تعداد تأمین‌کنندگان با manifest backup مطابقت ندارد");
  }
  if (
    !Array.isArray(vendorData.quotes) ||
    vendorData.quotes.length !== vendorCountRecord.quotes
  ) {
    throw new Error("تعداد استعلام‌ها با manifest backup مطابقت ندارد");
  }

  const checksums = parsed.checksums;
  if (!checksums || typeof checksums !== "object" || Array.isArray(checksums)) {
    throw new Error("checksumهای backup وجود ندارد");
  }
  const checksumRecord = checksums as Record<string, unknown>;
  if (
    checksumRecord.accounting !== checksumJson(accountingSection) ||
    checksumRecord.vendorDirectory !== checksumJson(vendorSection)
  ) {
    throw new Error("checksum backup معتبر نیست؛ فایل ناقص یا تغییر داده شده است");
  }

  const accounting = stripLocalSecurity(importPayload(JSON.stringify(accountingSection)));
  const vendorDirectory = importVendorDirectory(JSON.stringify(vendorSection));
  return { accounting, vendorDirectory, unified: true };
}
