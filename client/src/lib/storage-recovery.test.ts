import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CORRUPT_STORAGE_KEY, loadState, STORAGE_KEY } from "./accounting";
import { loadVendorDirectory, VENDOR_CORRUPT_STORAGE_KEY, VENDOR_STORAGE_KEY } from "./vendorDirectory";

describe("local storage corruption recovery", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    get length() { return values.size; },
  } as Storage;
  const originalError = console.error;

  beforeEach(() => {
    values.clear();
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
    Object.defineProperty(globalThis, "window", { configurable: true, value: globalThis });
    console.error = () => undefined;
  });

  afterEach(() => {
    console.error = originalError;
    values.clear();
  });

  it("quarantines malformed accounting state before returning a safe seed", () => {
    values.set(STORAGE_KEY, "{not-json");
    const recovered = loadState();
    expect(recovered.transactions).toEqual([]);
    const snapshot = JSON.parse(values.get(CORRUPT_STORAGE_KEY) || "{}");
    expect(snapshot.raw).toBe("{not-json");
    expect(snapshot.capturedAt).toEqual(expect.any(String));
  });

  it("quarantines malformed vendor state before returning an empty directory", () => {
    values.set(VENDOR_STORAGE_KEY, "{not-json");
    const recovered = loadVendorDirectory();
    expect(recovered.vendors).toEqual([]);
    const snapshot = JSON.parse(values.get(VENDOR_CORRUPT_STORAGE_KEY) || "{}");
    expect(snapshot.raw).toBe("{not-json");
    expect(snapshot.capturedAt).toEqual(expect.any(String));
  });
});
