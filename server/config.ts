import "dotenv/config";

export interface AppConfig {
  demo: boolean;
  host: string;
  port: number;
  frontendOrigin: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  openaiApiKey: string;
  openaiModel: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const demo = env.DEMO_MODE === "true";
  const host = env.HOST || "127.0.0.1";
  if (
    demo &&
    (env.NODE_ENV === "production" ||
      !["127.0.0.1", "localhost", "::1"].includes(host))
  ) {
    throw new Error("Деморежим разрешён только локально и не в production.");
  }
  if (!demo && (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)) {
    throw new Error(
      "Настройте Supabase или включите локальный DEMO_MODE=true.",
    );
  }
  return {
    demo,
    host,
    port: Number(env.PORT || 3001),
    frontendOrigin: env.FRONTEND_ORIGIN || "http://localhost:5173",
    supabaseUrl: env.SUPABASE_URL || "",
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || "",
    openaiApiKey: env.OPENAI_API_KEY || "",
    openaiModel: env.OPENAI_MODEL || "",
  };
}
