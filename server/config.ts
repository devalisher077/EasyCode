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

/** Local aliases are equivalent only for a loopback-bound, locally configured API.
 * Public deployments retain the single explicitly configured frontend origin. */
export function frontendOrigins(config: AppConfig): Set<string> {
  const frontend = new URL(config.frontendOrigin);
  if (!['http:', 'https:'].includes(frontend.protocol) || frontend.username ||
    frontend.password || frontend.pathname !== '/' || frontend.search || frontend.hash)
    throw new Error('FRONTEND_ORIGIN должен содержать только адрес сайта без пути.');
  const origins = new Set([frontend.origin]);
  const loopback = ['localhost', '127.0.0.1', '::1', '[::1]'];
  if (loopback.includes(config.host) && loopback.includes(frontend.hostname)) {
    for (const hostname of ['localhost', '127.0.0.1', '[::1]']) {
      const alias = new URL(frontend.origin);
      alias.hostname = hostname;
      origins.add(alias.origin);
    }
  }
  return origins;
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
