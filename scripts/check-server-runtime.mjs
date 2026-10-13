import assert from "node:assert/strict";
import inject from "light-my-request";

// Test native Node ESM, not Vite/tsx or a bundle that inlines JSON imports.
// Use only inert credentials; none of these anonymous requests contact Supabase.
Object.assign(process.env, {
  NODE_ENV: "production",
  DEMO_MODE: "false",
  HOST: "127.0.0.1",
  FRONTEND_ORIGIN: "https://easycode-runtime.example",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "runtime-test-key",
  OPENAI_API_KEY: "",
  OPENAI_MODEL: "",
});
const { default: handler } = await import("../build/runtime-check/api/index.js");
const headers = { origin: process.env.FRONTEND_ORIGIN };
const health = await inject(handler, { url: "/api/health", headers });
assert.equal(health.statusCode, 200);
assert.deepEqual(health.json(), { mode: "supabase", aiConfigured: false });
const catalog = await inject(handler, { url: "/api/catalog", headers });
assert.equal(catalog.statusCode, 200);
assert.equal(catalog.json().sections.length, 6);
const lesson = await inject(handler, { url: "/api/lessons/1.1", headers });
assert.equal(lesson.statusCode, 200);
assert.ok(lesson.json().lesson.quiz.every(question => !("correctOptionId" in question)));
const me = await inject(handler, { url: "/api/me", headers });
assert.equal(me.statusCode, 401);
console.log("Native Node ESM runtime: health, catalog, lesson and access checks passed.");
