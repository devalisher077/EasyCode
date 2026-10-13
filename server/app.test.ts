import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "./app.js";
import { loadConfig, type AppConfig } from "./config.js";
import { DEFAULT_WORLD } from "../shared/simulator.js";
import { DEMO_CLASS } from "./store.js";

const config: AppConfig = {
  demo: true,
  host: "127.0.0.1",
  port: 3001,
  frontendOrigin: "http://localhost:5173",
  supabaseUrl: "",
  supabaseServiceRoleKey: "",
  openaiApiKey: "",
  openaiModel: "",
};
const teacher = { "x-demo-role": "teacher" };
let apps: FastifyInstance[] = [];
async function setup() {
  const app = await createApp(config);
  apps.push(app);
  return app;
}
afterEach(async () => {
  await Promise.all(apps.map((a) => a.close()));
  apps = [];
});

describe("API access control and local workflow", () => {
  it("returns hints in the selected language and rejects unsupported languages", async () => {
    const app = await setup();
    for (const [language, fragment] of [["en", "Check the car's direction"], ["kk", "Көлік бағытын"], ["ru", "Проверь направление"]]) {
      const response = await app.inject({ method: 'POST', url: '/api/hints', payload: {code: 'robot.forward(1)', language} });
      expect(response.statusCode).toBe(200);
      expect(response.json().source).toBe('local');
      expect(response.json().hint).toContain(fragment);
    }
    expect((await app.inject({ method: 'POST', url: '/api/hints', payload: {code: '', language: 'invalid'} })).statusCode).toBe(400);
  });
  it("accepts local aliases in Supabase mode but still requires authentication for class writes", async () => {
    const app = await createApp({ ...config, demo: false,
      supabaseUrl: "https://example.supabase.co", supabaseServiceRoleKey: "test-server-key" });
    apps.push(app);
    for (const origin of ["http://localhost:5173", "http://127.0.0.1:5173", "http://[::1]:5173"]) {
      const preflight = await app.inject({ method: "OPTIONS", url: "/api/classes",
        headers: { origin, "access-control-request-method": "POST",
          "access-control-request-headers": "content-type,authorization" } });
      expect(preflight.statusCode).toBe(204);
      expect(preflight.headers["access-control-allow-origin"]).toBe(origin);
      for (const url of ["/api/classes", "/api/classes/join"]) {
        const response = await app.inject({ method: "POST", url,
          headers: { origin }, payload: {} });
        expect(response.statusCode).toBe(401);
        expect(response.json().error).toBe("Войдите в аккаунт.");
      }
    }
    const rejected = await app.inject({ method: "POST", url: "/api/classes",
      headers: { origin: "http://localhost.evil.example:5173" }, payload: {} });
    expect(rejected.statusCode).toBe(403);
  });
  it("identifies explicit demo mode and rejects unsafe demo configuration", async () => {
    const app = await setup();
    expect((await app.inject("/api/health")).json()).toEqual({
      mode: "demo",
      aiConfigured: false,
    });
    expect(() =>
      loadConfig({ DEMO_MODE: "true", NODE_ENV: "production" }),
    ).toThrow();
    expect(() => loadConfig({ DEMO_MODE: "true", HOST: "0.0.0.0" })).toThrow();
    expect(() => loadConfig({ DEMO_MODE: "false" })).toThrow();
  });
  it("never accepts demonstration roles when Supabase mode is selected", async () => {
    const app = await createApp({
      ...config,
      demo: false,
      supabaseUrl: "https://example.supabase.co",
      supabaseServiceRoleKey: "test-server-key",
    });
    apps.push(app);
    const response = await app.inject({ url: "/api/me", headers: teacher });
    expect(response.statusCode).toBe(401);
    expect((await app.inject("/api/health")).json().mode).toBe("supabase");
    const catalog = await app.inject({ url: "/api/catalog", headers: teacher });
    expect(catalog.statusCode).toBe(200);
    expect(JSON.stringify(catalog.json())).not.toContain("teacher_notes");
    expect(catalog.headers["cache-control"]).toBe("private, no-store");
    expect(
      (
        await app.inject({
          url: "/api/catalog",
          headers: { authorization: "not-a-bearer" },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (await app.inject("/api/materials?path=course-plan/План%20разделов.docx"))
        .statusCode,
    ).toBe(401);
  });
  it("filters teacher notes and protects exact material paths", async () => {
    const app = await setup();
    const studentCatalog = (await app.inject("/api/catalog")).json();
    expect(JSON.stringify(studentCatalog)).not.toContain("teacher_notes");
    const teacherCatalog = (
      await app.inject({ url: "/api/catalog", headers: teacher })
    ).json();
    expect(JSON.stringify(teacherCatalog)).toContain("teacher_notes");
    const note = "section-01/topic-01/Конспект для учителя.docx";
    expect(
      (await app.inject(`/api/materials?path=${encodeURIComponent(note)}`))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          url: `/api/materials?path=${encodeURIComponent(note)}`,
          headers: teacher,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await app.inject("/api/materials?path=../../.env")).statusCode,
    ).toBe(404);
  });
  it("allows teacher creation and pupil join, blocks cross-class access before joining", async () => {
    const app = await setup();
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/classes",
          payload: { name: "Новый класс" },
        })
      ).statusCode,
    ).toBe(403);
    const create = await app.inject({
      method: "POST",
      url: "/api/classes",
      headers: teacher,
      payload: { name: "Новый класс" },
    });
    const classroom = create.json().class;
    expect(create.statusCode).toBe(200);
    expect(classroom.member_count).toBe(0);
    expect(
      (await app.inject(`/api/sections?classId=${classroom.id}`)).statusCode,
    ).toBe(403);
    const joined = await app.inject({
      method: "POST",
      url: "/api/classes/join",
      payload: { code: classroom.join_code },
    });
    expect(joined.statusCode).toBe(200);
    expect(joined.json().class.join_code).toBe("");
    expect(
      (await app.inject("/api/classes"))
        .json()
        .classes.find((c: { id: string }) => c.id === classroom.id)
        .member_count,
    ).toBe(1);
    expect(
      (await app.inject(`/api/sections?classId=${classroom.id}`)).statusCode,
    ).toBe(200);
    const section = (
      await app.inject({
        method: "POST",
        url: "/api/sections",
        headers: teacher,
        payload: {
          classId: classroom.id,
          title: "Алгоритмы",
          theory: "Порядок команд важен.",
        },
      })
    ).json().section;
    expect(section.theory).toBe("Порядок команд важен.");
    const task = await app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: teacher,
      payload: {
        classId: classroom.id,
        sectionId: section.id,
        title: "Первая поездка",
        description: "Дойди до финиша",
        difficulty: "easy",
        world: DEFAULT_WORLD,
      },
    });
    expect(task.statusCode).toBe(200);
    expect(
      (await app.inject(`/api/tasks?classId=${classroom.id}`)).json().tasks,
    ).toHaveLength(2);
  });
  it("excludes teacher test runs from pupil class results", async () => {
    const app = await setup();
    const task = (
      await app.inject({
        method: "POST",
        url: "/api/tasks",
        headers: teacher,
        payload: {
          classId: DEMO_CLASS,
          title: "Тест учителя",
          description: "Проверка маршрута",
          difficulty: "easy",
          world: DEFAULT_WORLD,
        },
      })
    ).json().task;
    const payload = { taskId: task.id, code: "robot.forward(1)" };
    const testRun = await app.inject({
      method: "POST",
      url: "/api/submissions",
      headers: teacher,
      payload,
    });
    expect(testRun.json().submission.is_test).toBe(true);
    const pupilRun = await app.inject({
      method: "POST",
      url: "/api/submissions",
      payload,
    });
    expect(pupilRun.json().submission.is_test).toBe(false);
    const results = (
      await app.inject({
        url: `/api/submissions?classId=${DEMO_CLASS}`,
        headers: teacher,
      })
    ).json().submissions;
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(pupilRun.json().submission.id);
    expect(
      (await app.inject({ url: "/api/submissions", headers: teacher })).json()
        .submissions,
    ).toHaveLength(1);
  });
  it("blocks pupil access to tasks, hints and results in a class they have not joined", async () => {
    const app = await setup();
    const classroom = (
      await app.inject({
        method: "POST",
        url: "/api/classes",
        headers: teacher,
        payload: { name: "Закрытый класс" },
      })
    ).json().class;
    const task = (
      await app.inject({
        method: "POST",
        url: "/api/tasks",
        headers: teacher,
        payload: {
          classId: classroom.id,
          title: "Закрытый маршрут",
          description: "Проверка доступа",
          difficulty: "easy",
          world: DEFAULT_WORLD,
        },
      })
    ).json().task;
    expect(
      (await app.inject(`/api/tasks?classId=${classroom.id}`)).statusCode,
    ).toBe(403);
    expect(
      (await app.inject(`/api/submissions?classId=${classroom.id}`)).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/submissions",
          payload: { taskId: task.id, code: "robot.forward(1)" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/hints",
          payload: { taskId: task.id, code: "robot.forward(1)" },
        })
      ).statusCode,
    ).toBe(403);
  });
  it("rejects forged score and computes success on the server", async () => {
    const app = await setup();
    const spoof = await app.inject({
      method: "POST",
      url: "/api/submissions",
      payload: {
        taskId: "intro-route",
        code: "robot.forward(1)",
        success: true,
      },
    });
    expect(spoof.statusCode).toBe(400);
    const failed = await app.inject({
      method: "POST",
      url: "/api/submissions",
      payload: { taskId: "intro-route", code: "robot.forward(1)" },
    });
    expect(failed.json().submission.success).toBe(false);
    const passed = await app.inject({
      method: "POST",
      url: "/api/submissions",
      payload: {
        taskId: "intro-route",
        code: "robot.forward(5)\nrobot.turn_left()\nrobot.forward(3)",
      },
    });
    expect(passed.json().submission.success).toBe(true);
    expect(
      (await app.inject("/api/submissions")).json().submissions,
    ).toHaveLength(2);
    expect(
      (await app.inject({ url: "/api/submissions", headers: teacher })).json()
        .submissions,
    ).toHaveLength(0);
  });
  it("validates world bounds and rejects a section from a different class", async () => {
    const app = await setup();
    const payload = {
      classId: DEMO_CLASS,
      title: "Некорректное поле",
      description: "Проверка задания",
      difficulty: "easy",
      world: { ...DEFAULT_WORLD, width: 100000 },
    };
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/tasks",
          headers: teacher,
          payload,
        })
      ).statusCode,
    ).toBe(400);
    const unknownSection = {
      ...payload,
      world: DEFAULT_WORLD,
      sectionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    };
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/tasks",
          headers: teacher,
          payload: unknownSection,
        })
      ).statusCode,
    ).toBe(400);
  });
  it("limits hints by authenticated identity rather than a shared school IP", async () => {
    const app = await setup();
    for (let index = 0; index < 6; index++) {
      expect((await app.inject({ method: "POST", url: "/api/hints", payload: { code: "" } })).statusCode).toBe(200);
    }
    const limited = await app.inject({ method: "POST", url: "/api/hints", payload: { code: "" } });
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error).toContain("Слишком много запросов");
    expect(limited.headers["retry-after"]).toBeTruthy();
    const spoofed = await app.inject({ method: "POST", url: "/api/hints", headers: { cookie: "role=teacher", "x-forwarded-for": "203.0.113.1" }, payload: { code: "" } });
    expect(spoofed.statusCode).toBe(429);
    expect((await app.inject({ method: "POST", url: "/api/hints", headers: teacher, payload: { code: "" } })).statusCode).toBe(200);
    for (let index = 0; index < 105; index++) expect((await app.inject("/api/me")).statusCode).toBe(200);
  });
  it("limits IP floods before an invalid bearer reaches Supabase auth", async () => {
    const app = await createApp({ ...config, demo: false, supabaseUrl: "https://example.supabase.co", supabaseServiceRoleKey: "test-server-key" });
    apps.push(app);
    for (let index = 0; index < 500; index++) await app.inject("/api/health");
    const limited = await app.inject({ url: "/api/me", headers: { authorization: "Bearer invalid", "x-forwarded-for": "203.0.113.2" } });
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error).toContain("Слишком много запросов");
    expect(limited.headers["retry-after"]).toBeTruthy();
  });
  it("uses honest local hints without keys and prevents untrusted origins", async () => {
    const app = await setup();
    const hint = await app.inject({
      method: "POST",
      url: "/api/hints",
      payload: { code: "" },
    });
    expect(hint.json().source).toBe("local");
    expect(hint.json().hint).toBeTruthy();
    const rejected = await app.inject({
      method: "POST",
      url: "/api/classes",
      headers: { ...teacher, origin: "https://evil.example" },
      payload: { name: "Нет" },
    });
    expect(rejected.statusCode).toBe(403);
    const remote = await app.inject({
      url: "/api/me",
      remoteAddress: "10.1.1.1",
    });
    expect(remote.statusCode).toBe(403);
    expect(
      (
        await app.inject({
          url: "/api/catalog",
          headers: { host: "hostile.example" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          url: "/api/catalog",
          headers: { host: "attacker@localhost" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          url: "/api/catalog",
          headers: { host: "localhost:invalid" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          url: "/api/catalog",
          headers: { host: "localhost:80" },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          url: "/api/catalog",
          headers: { host: "[::1]:5173" },
        })
      ).statusCode,
    ).toBe(200);
  });
});
