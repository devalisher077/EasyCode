import type { IncomingMessage, ServerResponse } from "node:http";
import { createApp } from "../server/app.js";
import { loadConfig } from "../server/config.js";

// One initialization per warm function instance, including concurrent cold requests.
// Unlike server/index.ts, this entry point must not listen on a local port.
let appPromise: ReturnType<typeof createApp> | undefined;
function getApp() {
  appPromise ??= (async () => {
    const config = loadConfig();
    if (config.demo) throw new Error("Vercel requires Supabase mode.");
    const app = await createApp(config);
    try {
      await app.ready();
      return app;
    } catch (error) {
      await app.close();
      throw error;
    }
  })().catch((error: unknown) => {
    appPromise = undefined;
    throw error;
  });
  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const app = await getApp();
    // Preserve the original /api URL, query, headers and raw request body.
    // Authentication, authorization and body limits remain in the existing API.
    app.server.emit("request", req, res);
  } catch {
    // Never return credentials, SDK errors or configuration values to the browser.
    console.error("EasyCode API initialization failed. Check server environment and bundled materials.");
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "private, no-store");
    res.end(JSON.stringify({ error: "Сервис временно недоступен. Проверьте конфигурацию сервера." }));
  }
}
