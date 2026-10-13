import { describe, expect, it } from "vitest";
import { frontendOrigins, type AppConfig } from "./config.js";

const local: AppConfig = {
  demo: false, host: "127.0.0.1", port: 3001,
  frontendOrigin: "http://localhost:5173", supabaseUrl: "",
  supabaseServiceRoleKey: "", openaiApiKey: "", openaiModel: "",
};

describe("frontend origin allowlist", () => {
  it("accepts loopback aliases with Supabase without widening protocol or port", () => {
    const origins = frontendOrigins(local);
    expect([...origins]).toEqual([
      "http://localhost:5173", "http://127.0.0.1:5173", "http://[::1]:5173",
    ]);
    for (const origin of ["https://localhost:5173", "http://localhost:5174",
      "https://evil.example", "http://localhost.evil.example:5173", "null"])
      expect(origins.has(origin)).toBe(false);
  });

  it("keeps public deployments restricted to their configured origin", () => {
    expect([...frontendOrigins({ ...local, frontendOrigin: "https://easycode.example/" })])
      .toEqual(["https://easycode.example"]);
    expect([...frontendOrigins({ ...local, host: "0.0.0.0" })])
      .toEqual(["http://localhost:5173"]);
  });

  it("preserves an explicitly chosen local port and protocol", () => {
    expect([...frontendOrigins({ ...local, frontendOrigin: "https://127.0.0.1:8443/" })])
      .toEqual(["https://127.0.0.1:8443", "https://localhost:8443", "https://[::1]:8443"]);
  });

  it.each(["https://user:secret@example.com", "https://example.com/path",
    "https://example.com?key=value", "https://example.com#fragment", "file:///tmp/site"])
    ("rejects a non-origin configuration: %s", (frontendOrigin) => {
      expect(() => frontendOrigins({ ...local, frontendOrigin })).toThrow();
    });
});
