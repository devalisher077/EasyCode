import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = await createApp(config);
await app.listen({ port: config.port, host: config.host });
console.info(
  `EasyCode API: http://${config.host}:${config.port} (${config.demo ? "DEMO — данные в памяти, сбрасываются при перезапуске" : "Supabase"})`,
);
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
