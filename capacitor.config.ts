import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "ir.workshop.accounting",
  appName: "حسابداری کارگاه",
  webDir: "dist/public",
  bundledWebRuntime: false,
  server: {
    androidScheme: "https",
  },
  android: {
    backgroundColor: "#f7f8fc",
    allowMixedContent: false,
  },
};

export default config;

/**
 * APK boundary:
 * - The owner app remains local-first and must never expose its full data to a customer.
 * - A customer app must use a separate authenticated read-only API and must not reuse this appId.
 * - Do not enable a remote `server.url` for production unless the threat model and TLS policy are reviewed.
 */
