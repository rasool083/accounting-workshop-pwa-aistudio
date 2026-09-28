import { describe, expect, it } from "vitest";
import {
  createCredential,
  hasLocalCredential,
  validatePassword,
  validatePin,
  verifyCredential,
} from "./security";

describe("local security credentials", () => {
  it("stores a salted hash and verifies only the original value", async () => {
    const credential = await createCredential("کارگاه-امن-۱۴۰۵");
    expect(credential.hash).not.toBe("کارگاه-امن-۱۴۰۵");
    expect(credential.salt).toBeTruthy();
    expect(await verifyCredential("کارگاه-امن-۱۴۰۵", credential)).toBe(true);
    expect(await verifyCredential("رمز اشتباه", credential)).toBe(false);
  });

  it("validates password and PIN policy", () => {
    expect(validatePassword("1234567")).toContain("۸");
    expect(validatePassword("12345678")).toBe("");
    expect(validatePin("123")).toContain("۴");
    expect(validatePin("12a45")).toContain("فقط");
    expect(validatePin("123456")).toBe("");
  });

  it("detects whether at least one local credential is configured", async () => {
    const credential = await createCredential("123456");
    expect(hasLocalCredential({ pin: credential })).toBe(true);
    expect(hasLocalCredential({})).toBe(false);
  });
});
