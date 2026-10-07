import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "./app.js";
import type { AppConfig } from "./config.js";
import { DEMO_CLASS, DEMO_STUDENT, DEMO_TEACHER, Store } from "./store.js";
import { DEFAULT_WORLD } from "../shared/simulator.js";

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
const teacherHeaders = { "x-demo-role": "teacher" };
const secondTeacher = "44444444-4444-4444-8444-444444444444";
const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("teacher workspace authorization", () => {
  it("rejects student creation even inside their joined class", async () => {
    const app = await createApp(config);
    apps.push(app);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/classes",
          payload: { name: "Мой класс" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/sections",
          payload: {
            classId: DEMO_CLASS,
            title: "Новый урок",
            theory: "Текст",
          },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/tasks",
          payload: {
            classId: DEMO_CLASS,
            title: "Новая практика",
            description: "Дойди до финиша",
            difficulty: "easy",
            world: DEFAULT_WORLD,
          },
        })
      ).statusCode,
    ).toBe(403);
  });

  it("lets a teacher publish only to their own class and prevents cross-class references", async () => {
    // Stub only the resolved profile so two teacher identities exercise the same
    // real authorization handlers and in-memory repository without a live DB.
    let currentTeacher = DEMO_TEACHER;
    vi.spyOn(Store.prototype, "getProfile").mockImplementation(async (id) => ({
      id: id === DEMO_TEACHER ? currentTeacher : DEMO_STUDENT,
      name: "Тестовый пользователь",
      role: id === DEMO_TEACHER ? "teacher" : "student",
    }));
    const app = await createApp(config);
    apps.push(app);
    const firstClass = (
      await app.inject({
        method: "POST",
        url: "/api/classes",
        headers: teacherHeaders,
        payload: { name: "Класс первого учителя" },
      })
    ).json().class;
    const firstSectionResponse = await app.inject({
      method: "POST",
      url: "/api/sections",
      headers: teacherHeaders,
      payload: {
        classId: firstClass.id,
        title: "Мой первый урок",
        theory: "Алгоритм — порядок действий.",
      },
    });
    expect(firstSectionResponse.statusCode).toBe(200);
    const firstSection = firstSectionResponse.json().section;
    expect(firstSection.class_id).toBe(firstClass.id);

    currentTeacher = secondTeacher;
    const secondClass = (
      await app.inject({
        method: "POST",
        url: "/api/classes",
        headers: teacherHeaders,
        payload: { name: "Класс второго учителя" },
      })
    ).json().class;
    const classes = (
      await app.inject({ url: "/api/classes", headers: teacherHeaders })
    ).json().classes;
    expect(classes.map((classroom: { id: string }) => classroom.id)).toEqual([
      secondClass.id,
    ]);
    for (const route of ["sections", "tasks", "submissions"]) {
      expect(
        (
          await app.inject({
            url: `/api/${route}?classId=${firstClass.id}`,
            headers: teacherHeaders,
          })
        ).statusCode,
      ).toBe(403);
    }
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/sections",
          headers: teacherHeaders,
          payload: {
            classId: firstClass.id,
            title: "Чужой урок",
            theory: "Нет доступа",
          },
        })
      ).statusCode,
    ).toBe(403);
    const task = {
      title: "Маршрут",
      description: "Дойди до финиша",
      difficulty: "easy",
      world: DEFAULT_WORLD,
    };
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/tasks",
          headers: teacherHeaders,
          payload: { ...task, classId: firstClass.id },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/tasks",
          headers: teacherHeaders,
          payload: {
            ...task,
            classId: secondClass.id,
            sectionId: firstSection.id,
          },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/tasks",
          headers: teacherHeaders,
          payload: { ...task, classId: secondClass.id },
        })
      ).statusCode,
    ).toBe(200);

    currentTeacher = DEMO_TEACHER;
    const ownSections = (
      await app.inject({
        url: `/api/sections?classId=${firstClass.id}`,
        headers: teacherHeaders,
      })
    ).json().sections;
    expect(ownSections).toHaveLength(1);
    expect(ownSections[0].theory).toBe("Алгоритм — порядок действий.");
  });

  it("does not promote a stored student from mutable auth metadata or role headers", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input);
      if (!url.endsWith("/auth/v1/user"))
        throw new Error("Unexpected network request in isolated test");
      return new Response(
        JSON.stringify({
          id: DEMO_STUDENT,
          aud: "authenticated",
          role: "authenticated",
          created_at: "2026-10-07T00:00:00.000Z",
          email: "student@example.test",
          app_metadata: {},
          user_metadata: { role: "teacher", name: "Изменённые метаданные" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(Store.prototype, "getProfile").mockResolvedValue({
      id: DEMO_STUDENT,
      name: "Ученик",
      role: "student",
    });
    const app = await createApp({
      ...config,
      demo: false,
      supabaseUrl: "https://example.supabase.co",
      supabaseServiceRoleKey: "test-server-key",
    });
    apps.push(app);
    const headers = {
      authorization: "Bearer test-token",
      "x-demo-role": "teacher",
    };
    const me = await app.inject({ url: "/api/me", headers });
    expect(me.statusCode).toBe(200);
    expect(me.json().role).toBe("student");
    const create = await app.inject({
      method: "POST",
      url: "/api/sections",
      headers,
      payload: { classId: DEMO_CLASS, title: "Урок", theory: "Текст" },
    });
    expect(create.statusCode).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
