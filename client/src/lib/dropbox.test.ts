import { describe, expect, it } from "vitest";
import {
  codeChallengeFor,
  createCodeVerifier,
  dropboxApiArg,
  dropboxBackupFolder,
  dropboxEntriesToBackups,
  dropboxErrorMessage,
  dropboxRedirectUri,
  persianYearMonth,
} from "./dropbox";

describe("Dropbox backup (main project)", () => {
  it("builds the PKCE S256 challenge (SHA-256, base64url, no padding)", async () => {
    expect(await codeChallengeFor("dBjftJeZ4CVP-mJ92K9SXYRWLNAZ6x9UwW4vBEdMM0k")).toBe(
      "-0l3Vxc9ElIJwdb0r1jVF57OVy8-2_Mzw-QUzT9qHPI"
    );
    const verifier = createCodeVerifier(new Uint8Array(48).fill(7));
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
  });

  it("uses the Pages base path as redirect", () => {
    expect(dropboxRedirectUri("https://rasool083.github.io", "/accounting-workshop-pwa-aistudio/")).toBe(
      "https://rasool083.github.io/accounting-workshop-pwa-aistudio/"
    );
    expect(dropboxRedirectUri("http://localhost:3000", "/")).toBe("http://localhost:3000/");
  });

  it("keeps only backup JSON files, newest first", () => {
    const list = dropboxEntriesToBackups([
      { ".tag": "folder", id: "1", name: "backup-old", path_lower: "/backup-old" },
      { ".tag": "file", id: "2", name: "notes.txt", path_lower: "/notes.txt" },
      { ".tag": "file", id: "3", name: "backup-1405-07-01-001.json", path_lower: "/backup-1405-07-01-001.json", server_modified: "2026-09-23T10:00:00Z", size: 10 },
      { ".tag": "file", id: "4", name: "dropbox-backup-1405-07-05-002.json", path_lower: "/dropbox-backup-1405-07-05-002.json", server_modified: "2026-09-27T10:00:00Z", size: 20 },
    ]);
    expect(list.map(file => file.name)).toEqual(["dropbox-backup-1405-07-05-002.json", "backup-1405-07-01-001.json"]);
    expect(list[0]).toMatchObject({ id: "/dropbox-backup-1405-07-05-002.json", size: "20" });
  });

  it("explains Dropbox API failures instead of a generic message (r6.1)", () => {
    const scope = dropboxErrorMessage(400, "Error in call to API function \"files/list_folder\": Your app is not permitted to access this endpoint because it does not have the required scope 'files.metadata.read'.", "x");
    expect(scope).toContain("Permissions");
    expect(scope).toContain("files.metadata.read");
    expect(dropboxErrorMessage(401, '{"error_summary": "missing_scope/.."}', "x")).toContain("Permissions");
    expect(dropboxErrorMessage(401, '{"error_summary": "expired_access_token/"}', "x")).toContain("منقضی");
    expect(dropboxErrorMessage(409, '{"error_summary": "path/not_found/"}', "x")).toBe("فایل در Dropbox پیدا نشد");
    expect(dropboxErrorMessage(500, "", "خطا")).toBe("خطا (کد 500)");
  });

  it("stores each backup in /backups/<year>/<MM-month> by its Persian date (r6.2)", () => {
    expect(dropboxBackupFolder("dropbox-backup-1405-07-05-002.json")).toBe("/accounting-workshop-pwa-aistudio/backups/1405/07-مهر");
    expect(dropboxBackupFolder("dropbox-backup-1405-12-29-014.json")).toBe("/accounting-workshop-pwa-aistudio/backups/1405/12-اسفند");
    expect(dropboxBackupFolder("dropbox-backup-1406-01-01-001.json")).toBe("/accounting-workshop-pwa-aistudio/backups/1406/01-فروردین");
    expect(dropboxBackupFolder("dropbox-backup.json", new Date("2026-09-27T12:00:00Z"))).toBe("/accounting-workshop-pwa-aistudio/backups/1405/07-مهر");
  });

  it("switches month at Nowruz 1406 in Tehran time", () => {
    expect(persianYearMonth(new Date("2027-03-20T20:00:00Z"))).toEqual({ year: 1405, month: 12 });
    expect(persianYearMonth(new Date("2027-03-20T21:00:00Z"))).toEqual({ year: 1406, month: 1 });
  });

  it("sends Persian paths as an ASCII-only Dropbox-API-Arg header", () => {
    const arg = dropboxApiArg({ path: "/accounting-workshop-pwa-aistudio/backups/1405/07-مهر/dropbox-backup-1405-07-05-002.json" });
    expect(arg).toMatch(/^[\x20-\x7e]+$/);
    expect(JSON.parse(arg).path).toBe("/accounting-workshop-pwa-aistudio/backups/1405/07-مهر/dropbox-backup-1405-07-05-002.json");
  });

  it("lists backups from month folders and the old root together", () => {
    const list = dropboxEntriesToBackups([
      { ".tag": "folder", id: "1", name: "07-مهر", path_lower: "/accounting-workshop-pwa-aistudio/backups/1405/07-مهر" },
      { ".tag": "file", id: "2", name: "dropbox-backup-1405-07-05-002.json", path_lower: "/accounting-workshop-pwa-aistudio/backups/1405/07-مهر/dropbox-backup-1405-07-05-002.json", server_modified: "2026-09-27T10:00:00Z" },
      { ".tag": "file", id: "3", name: "dropbox-backup-1405-07-05-001.json", path_lower: "/dropbox-backup-1405-07-05-001.json", server_modified: "2026-09-27T09:00:00Z" },
    ]);
    expect(list.map(file => file.id)).toEqual([
      "/accounting-workshop-pwa-aistudio/backups/1405/07-مهر/dropbox-backup-1405-07-05-002.json",
      "/dropbox-backup-1405-07-05-001.json",
    ]);
  });
});
