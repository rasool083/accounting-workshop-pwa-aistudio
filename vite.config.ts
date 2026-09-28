import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";

const PROJECT_ROOT = import.meta.dirname;
let BUILD_COMMIT = process.env.VITE_BUILD_COMMIT || "dev";
try {
  BUILD_COMMIT = execSync("git rev-parse --short HEAD", {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "ignore"],
  }).trim();
} catch {
  BUILD_COMMIT = "dev";
}
const LOG_DIR = path.join(PROJECT_ROOT, ".manus-logs");
const MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024;
const TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6);

type LogSource = "browserConsole" | "networkRequests" | "sessionReplay";
function ensureLogDir() { if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true }); }
function trimLogFile(logPath: string, maxSize: number) { try { if (!fs.existsSync(logPath) || fs.statSync(logPath).size <= maxSize) return; const lines = fs.readFileSync(logPath, "utf-8").split("\n"); const kept: string[] = []; let bytes = 0; for (let i = lines.length - 1; i >= 0; i--) { const lineBytes = Buffer.byteLength(`${lines[i]}\n`, "utf-8"); if (bytes + lineBytes > TRIM_TARGET_BYTES) break; kept.unshift(lines[i]); bytes += lineBytes; } fs.writeFileSync(logPath, kept.join("\n"), "utf-8"); } catch { /* logging must never break the app */ } }
function writeToLogFile(source: LogSource, entries: unknown[]) { if (!entries.length) return; ensureLogDir(); const logPath = path.join(LOG_DIR, `${source}.log`); fs.appendFileSync(logPath, `${entries.map((entry) => `[${new Date().toISOString()}] ${JSON.stringify(entry)}`).join("\n")}\n`, "utf-8"); trimLogFile(logPath, MAX_LOG_SIZE_BYTES); }
function vitePluginManusDebugCollector(): Plugin { return { name: "manus-debug-collector", transformIndexHtml(html) { if (process.env.NODE_ENV === "production") return html; return { html, tags: [{ tag: "script", attrs: { src: "/__manus__/debug-collector.js", defer: true }, injectTo: "head" }] }; }, configureServer(server) { server.middlewares.use("/__manus__/logs", (req, res, next) => { if (req.method !== "POST") return next(); let body = ""; req.on("data", (chunk) => { body += chunk.toString(); }); req.on("end", () => { try { const payload = JSON.parse(body); if (payload.consoleLogs) writeToLogFile("browserConsole", payload.consoleLogs); if (payload.networkRequests) writeToLogFile("networkRequests", payload.networkRequests); if (payload.sessionEvents) writeToLogFile("sessionReplay", payload.sessionEvents); res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ success: true })); } catch (error) { res.writeHead(400); res.end(String(error)); } }); }); } }; }
function vitePluginStorageProxy(): Plugin { return { name: "manus-storage-proxy", configureServer(server) { server.middlewares.use("/manus-storage", async (req, res) => { const key = req.url?.replace(/^\//, ""); if (!key) { res.writeHead(400); res.end("Missing storage key"); return; } const forgeBaseUrl = (process.env.BUILT_IN_FORGE_API_URL || "").replace(/\/+$/, ""); const forgeKey = process.env.BUILT_IN_FORGE_API_KEY; if (!forgeBaseUrl || !forgeKey) { res.writeHead(500); res.end("Storage proxy not configured"); return; } try { const forgeUrl = new URL("v1/storage/presign/get", `${forgeBaseUrl}/`); forgeUrl.searchParams.set("path", key); const response = await fetch(forgeUrl, { headers: { Authorization: `Bearer ${forgeKey}` } }); const { url } = await response.json() as { url: string }; res.writeHead(307, { Location: url, "Cache-Control": "no-store" }); res.end(); } catch { res.writeHead(502); res.end("Storage proxy error"); } }); } }; }

const plugins = [react(), tailwindcss(), jsxLocPlugin(), vitePluginManusRuntime(), vitePluginManusDebugCollector(), vitePluginStorageProxy()];
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? "/accounting-workshop-pwa-aistudio/" : "/",
  define: {
    "import.meta.env.VITE_BUILD_COMMIT": JSON.stringify(BUILD_COMMIT),
  },
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
      react: path.resolve(import.meta.dirname, "node_modules/react"),
      "react-dom": path.resolve(import.meta.dirname, "node_modules/react-dom"),
    },
    dedupe: ["react", "react-dom"],
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  build: { outDir: path.resolve(import.meta.dirname, "dist/public"), emptyOutDir: true },
  server: { port: 3000, strictPort: false, host: "0.0.0.0", allowedHosts: true, fs: { strict: true, deny: ["**/.*"] } },
});
