import { describe, expect, it } from "vitest";
import { isBackupFilename } from "./googleDrive";

describe("Google Drive backup filenames", () => {
  it("accepts both legacy and current backup names", () => {
    expect(isBackupFilename("accounting-workshop-backup-initial-1405-06-26.json")).toBe(true);
    expect(isBackupFilename("backup-1405-06-31-001.json")).toBe(true);
  });

  it("rejects unrelated files and non-JSON files", () => {
    expect(isBackupFilename("accounting-workshop-backup-1405-06-31.txt")).toBe(false);
    expect(isBackupFilename("invoice-1405-06-31.json")).toBe(false);
  });
});
