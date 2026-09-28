export type VendorKind = "تولیدکننده" | "واردکننده" | "بازرگانی" | "نماینده" | "سایر";
export type QuoteStatus = "معتبر" | "منقضی" | "بررسی نشده";

export type Vendor = {
  id: string;
  name: string;
  kind: VendorKind;
  contactName: string;
  phone: string;
  email: string;
  location: string;
  website: string;
  suppliedMaterials: string[];
  notes: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type VendorQuote = {
  id: string;
  vendorId: string;
  materialName: string;
  productId?: string;
  quoteDate: string;
  price: number;
  currency: string;
  unit: string;
  packageDescription: string;
  minimumOrder: string;
  leadTimeDays?: number;
  validUntil: string;
  status: QuoteStatus;
  source: string;
  notes: string;
  createdAt: string;
};

export type VendorDirectoryState = {
  version: 1;
  vendors: Vendor[];
  quotes: VendorQuote[];
};

export const VENDOR_DIRECTORY_BACKUP_FORMAT = "vendor-directory-backup-v1";

export type VendorDirectoryExport = {
  format: typeof VENDOR_DIRECTORY_BACKUP_FORMAT;
  exportedAt: string;
  data: VendorDirectoryState;
};

export const VENDOR_STORAGE_KEY = "accounting-workshop-pwa-aistudio:vendor-directory:v1";
export const VENDOR_CORRUPT_STORAGE_KEY = `${VENDOR_STORAGE_KEY}:corrupt-snapshot`;

const emptyState: VendorDirectoryState = { version: 1, vendors: [], quotes: [] };

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function loadVendorDirectory(): VendorDirectoryState {
  if (typeof window === "undefined") return emptyState;
  try {
    const raw = localStorage.getItem(VENDOR_STORAGE_KEY);
    if (!raw) return emptyState;
    const parsed = JSON.parse(raw) as Partial<VendorDirectoryState>;
    return {
      version: 1,
      vendors: Array.isArray(parsed.vendors) ? parsed.vendors : [],
      quotes: Array.isArray(parsed.quotes) ? parsed.quotes : [],
    };
  } catch (error) {
    try {
      const raw = localStorage.getItem(VENDOR_STORAGE_KEY);
      if (raw) {
        localStorage.setItem(VENDOR_CORRUPT_STORAGE_KEY, JSON.stringify({
          capturedAt: new Date().toISOString(),
          raw,
        }));
      }
    } catch {
      // A storage quota/security failure must not hide the original recovery path.
    }
    console.error("Vendor directory state was quarantined after storage corruption.", error);
    return emptyState;
  }
}

export function saveVendorDirectory(state: VendorDirectoryState) {
  if (typeof window !== "undefined") localStorage.setItem(VENDOR_STORAGE_KEY, JSON.stringify(state));
  return state;
}

export function exportVendorDirectory(state: VendorDirectoryState): string {
  return JSON.stringify({
    format: VENDOR_DIRECTORY_BACKUP_FORMAT,
    exportedAt: new Date().toISOString(),
    data: state,
  } satisfies VendorDirectoryExport, null, 2);
}

export function importVendorDirectory(raw: string): VendorDirectoryState {
  const parsed = JSON.parse(raw) as Partial<VendorDirectoryExport>;
  if (parsed.format !== VENDOR_DIRECTORY_BACKUP_FORMAT || !parsed.data) {
    throw new Error("فایل پشتیبان دفتر تأمین‌کنندگان معتبر نیست");
  }
  const data = parsed.data as Partial<VendorDirectoryState>;
  if (data.version !== 1 || !Array.isArray(data.vendors) || !Array.isArray(data.quotes)) {
    throw new Error("ساختار فایل پشتیبان دفتر تأمین‌کنندگان ناقص است");
  }
  return { version: 1, vendors: data.vendors, quotes: data.quotes };
}

export function createVendor(input: Omit<Vendor, "id" | "createdAt" | "updatedAt">): Vendor {
  const now = new Date().toISOString();
  return { ...input, id: makeId("vendor"), createdAt: now, updatedAt: now };
}

export function createVendorQuote(input: Omit<VendorQuote, "id" | "createdAt">): VendorQuote {
  return { ...input, id: makeId("quote"), createdAt: new Date().toISOString() };
}

export type VendorMaterialStat = {
  materialName: string;
  quoteCount: number;
  comparableQuoteCount: number;
  vendorCount: number;
  latestPrice?: number;
  lowestPrice?: number;
  averagePrice?: number;
  latestDate?: string;
  lowestVendorId?: string;
  previousPrice?: number;
  changePercent?: number;
  comparisonCurrency?: string;
  comparisonUnit?: string;
};

export function materialNames(state: VendorDirectoryState) {
  return Array.from(new Set([
    ...state.vendors.flatMap(vendor => vendor.suppliedMaterials),
    ...state.quotes.map(quote => quote.materialName),
  ].map(name => name.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "fa"));
}

export function getMaterialStats(state: VendorDirectoryState, materialName?: string): VendorMaterialStat[] {
  const names = materialName ? [materialName] : materialNames(state);
  return names.map(name => {
    const allQuotes = state.quotes
      .filter(quote => quote.materialName === name && quote.price >= 0)
      .sort((a, b) => b.quoteDate.localeCompare(a.quoteDate) || b.createdAt.localeCompare(a.createdAt));
    const basis = allQuotes[0];
    const quotes = basis
      ? allQuotes.filter(quote => quote.currency === basis.currency && quote.unit === basis.unit)
      : [];
    const prices = quotes.map(quote => quote.price);
    const latest = quotes[0];
    const previous = quotes[1];
    const lowest = quotes.reduce<VendorQuote | undefined>((best, quote) => !best || quote.price < best.price ? quote : best, undefined);
    return {
      materialName: name,
      quoteCount: allQuotes.length,
      comparableQuoteCount: quotes.length,
      vendorCount: new Set(allQuotes.map(quote => quote.vendorId)).size,
      latestPrice: latest?.price,
      lowestPrice: lowest?.price,
      averagePrice: prices.length ? prices.reduce((sum, price) => sum + price, 0) / prices.length : undefined,
      latestDate: latest?.quoteDate,
      lowestVendorId: lowest?.vendorId,
      previousPrice: previous?.price,
      changePercent: latest && previous && previous.price !== 0 ? ((latest.price - previous.price) / previous.price) * 100 : undefined,
      comparisonCurrency: basis?.currency,
      comparisonUnit: basis?.unit,
    } satisfies VendorMaterialStat;
  });
}

export function quoteUnitKey(quote: VendorQuote) {
  return `${quote.price} ${quote.currency}/${quote.unit}`;
}
