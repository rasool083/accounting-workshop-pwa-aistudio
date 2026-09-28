import { describe, expect, it } from "vitest";
import {
  DEFAULT_CURRENCY_CODE,
  exportPayload,
  normalizeState,
  type AppState,
} from "./accounting";
import { exportUnifiedPayload } from "./backup";
import { priceUnitFixture } from "./fixtures/price-unit.fixture";

describe("تومان currency contract", () => {
  it("uses تومان as the default for legacy data without a currency", () => {
    const state = normalizeState({
      ...priceUnitFixture,
      settings: { ...priceUnitFixture.settings, currency: undefined, currencyCode: undefined },
    });
    expect(state.settings.currencyCode).toBe(DEFAULT_CURRENCY_CODE);
    expect(state.settings.currency).toBe("تومان");
  });

  it("preserves an explicitly declared ریال project without converting values", () => {
    const legacy = normalizeState({
      ...priceUnitFixture,
      settings: { ...priceUnitFixture.settings, currency: "ریال", currencyCode: undefined },
    });
    expect(legacy.settings.currencyCode).toBe("IRR");
    expect(legacy.settings.currency).toBe("ریال");
    expect(legacy.invoices[0].amount).toBe(priceUnitFixture.invoices[0].amount);
  });

  it("writes stable currency metadata into a backup", () => {
    const payload = JSON.parse(exportPayload(normalizeState(priceUnitFixture))) as {
      currency: { code: string; label: string };
      data: AppState;
    };
    expect(payload.currency).toEqual({ code: "IRT", label: "تومان" });
    expect(payload.data.settings.currencyCode).toBe("IRT");
  });

  it("writes تومان metadata into a unified backup envelope", () => {
    const payload = JSON.parse(
      exportUnifiedPayload(normalizeState(priceUnitFixture), {
        version: 1,
        vendors: [],
        quotes: [],
      })
    ) as { currency: { code: string; label: string } };
    expect(payload.currency).toEqual({ code: "IRT", label: "تومان" });
  });
});
