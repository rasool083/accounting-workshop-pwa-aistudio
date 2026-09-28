export type DriveBackupFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
};

/**
 * Both naming contracts are intentionally accepted during the transition:
 * the old long prefix and the current short `backup-YYYY-MM-DD-NNN.json` name.
 */
export const BACKUP_FILENAME_MARKER = "backup";

export function isBackupFilename(name: string) {
  const normalized = name.trim().toLowerCase();
  return normalized.includes(BACKUP_FILENAME_MARKER) && normalized.endsWith(".json");
}

export type GoogleDriveAdapter = {
  listBackups: () => Promise<DriveBackupFile[]>;
  uploadBackup: (filename: string, payload: string) => Promise<DriveBackupFile>;
  downloadBackup: (fileId: string) => Promise<string>;
};

/** Folder created specifically for this project in the user's Drive. */
export const PROJECT_DRIVE_FOLDER_ID = "1Qrql348yLKgkKNEzRDYUwLAa1ylbEx8h";
export const PROJECT_BACKUPS_FOLDER_ID = "12qwZHYKcI7Zsg-m5gYOCCkzQc8Ynpthx";
export const PROJECT_DRIVE_FOLDER_URL =
  "https://drive.google.com/drive/folders/1Qrql348yLKgkKNEzRDYUwLAa1ylbEx8h";
export const PROJECT_BACKUPS_FOLDER_URL =
  "https://drive.google.com/drive/folders/12qwZHYKcI7Zsg-m5gYOCCkzQc8Ynpthx";
export const LAST_VERIFIED_BACKUP: DriveBackupFile = {
  id: "1CJDm58g25rGVwIG_EmrcgYaouoq6hlvq",
  name: "accounting-workshop-backup-initial-1405-06-26.json",
  mimeType: "application/json",
  modifiedTime: "2026-09-16T21:59:32.040Z",
  size: "1227",
};

declare global {
  interface Window {
    __ACCOUNTING_DRIVE_ACCESS_TOKEN__?: string;
  }
}

type GoogleOAuthWindow = Window & {
  google?: {
    accounts?: {
      oauth2?: {
        initTokenClient: (config: {
          client_id: string;
          scope: string;
          callback: (response: {
            access_token?: string;
            error?: string;
            error_description?: string;
          }) => void;
        }) => { requestAccessToken: (options?: { prompt?: string }) => void };
      };
    };
  };
};

const DRIVE_CLIENT_ID_KEY = "accounting-workshop-pwa-aistudio:google-client-id";
/** OAuth client IDs are public identifiers; never put a client secret here. */
export const PUBLIC_DRIVE_CLIENT_ID =
  "378766848772-o2c4g9p1v46dn6g8ns63jgr2ov4qrke5.apps.googleusercontent.com";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

export function getDriveClientId() {
  if (typeof window === "undefined") return PUBLIC_DRIVE_CLIENT_ID;
  const stored = localStorage.getItem(DRIVE_CLIENT_ID_KEY) || "";
  // Do not let a stale/invalid value from an earlier mobile session win.
  if (!stored || stored !== PUBLIC_DRIVE_CLIENT_ID) {
    localStorage.setItem(DRIVE_CLIENT_ID_KEY, PUBLIC_DRIVE_CLIENT_ID);
    return PUBLIC_DRIVE_CLIENT_ID;
  }
  return stored;
}

export function setDriveClientId(clientId: string) {
  if (typeof window === "undefined") return;
  const value = clientId.trim();
  if (value === PUBLIC_DRIVE_CLIENT_ID)
    localStorage.setItem(DRIVE_CLIENT_ID_KEY, PUBLIC_DRIVE_CLIENT_ID);
  else localStorage.setItem(DRIVE_CLIENT_ID_KEY, PUBLIC_DRIVE_CLIENT_ID);
}

function loadGoogleIdentityServices() {
  if (typeof window === "undefined")
    return Promise.reject(new Error("مرورگر در دسترس نیست"));
  const browser = window as GoogleOAuthWindow;
  if (browser.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]'
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("بارگذاری Google Identity Services ناموفق بود")),
        { once: true }
      );
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("بارگذاری Google Identity Services ناموفق بود"));
    document.head.appendChild(script);
  });
}

export async function requestDriveAccessToken(clientId: string) {
  const normalizedClientId = clientId.trim();
  if (!normalizedClientId)
    throw new Error("ابتدا Google OAuth Client ID را وارد کنید");
  await loadGoogleIdentityServices();
  const browser = window as GoogleOAuthWindow;
  return new Promise<string>((resolve, reject) => {
    const client = browser.google?.accounts?.oauth2?.initTokenClient({
      client_id: normalizedClientId,
      scope: DRIVE_SCOPE,
      callback: response => {
        if (response.access_token) resolve(response.access_token);
        else
          reject(
            new Error(
              response.error_description ||
                response.error ||
                "دریافت مجوز Drive ناموفق بود"
            )
          );
      },
    });
    if (!client)
      reject(new Error("Google Identity Services در این مرورگر آماده نیست"));
    else client.requestAccessToken({ prompt: "consent" });
  });
}

export function getDriveAccessToken() {
  return typeof window !== "undefined"
    ? window.__ACCOUNTING_DRIVE_ACCESS_TOKEN__ || ""
    : "";
}

/**
 * Creates a short-lived Google Drive adapter from an OAuth access token.
 * The token is intentionally supplied by the host/connector and is never
 * written to localStorage, exported JSON, or React state.
 */
export function createGoogleDriveAdapter(
  accessToken: string,
  folderId?: string
): GoogleDriveAdapter {
  if (!accessToken.trim()) throw new Error("Google Drive مجوز دسترسی ندارد");
  const headers = { Authorization: `Bearer ${accessToken}` };
  const q = folderId ? `'${folderId}' in parents and ` : "";
  return {
    async listBackups() {
      const params = new URLSearchParams({
        q: `${q}trashed = false and mimeType = 'application/json' and name contains 'backup'`,
        pageSize: "100",
        orderBy: "modifiedTime desc",
        fields: "files(id,name,mimeType,modifiedTime,size)",
      });
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?${params}`,
        { headers }
      );
      if (!response.ok) throw new Error(`Google Drive: ${response.status}`);
      const data = (await response.json()) as { files?: DriveBackupFile[] };
      return (data.files || []).filter(file => isBackupFilename(file.name));
    },
    async uploadBackup(filename, payload) {
      const metadata = {
        name: filename,
        mimeType: "application/json",
        ...(folderId ? { parents: [folderId] } : {}),
      };
      const boundary = `accounting-${crypto.randomUUID()}`;
      const body = [
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${payload}\r\n`,
        `--${boundary}--`,
      ].join("");
      const response = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime,size",
        {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": `multipart/related; boundary=${boundary}`,
          },
          body,
        }
      );
      if (!response.ok) throw new Error(`Google Drive: ${response.status}`);
      return (await response.json()) as DriveBackupFile;
    },
    async downloadBackup(fileId) {
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
        { headers }
      );
      if (!response.ok) throw new Error(`Google Drive: ${response.status}`);
      return response.text();
    },
  };
}
