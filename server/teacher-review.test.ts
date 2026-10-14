import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "./app.js";
import { DEMO_CLASS, DEMO_STUDENT, DEMO_TEACHER, Store } from "./store.js";
import type { AppConfig } from "./config.js";
import { starterCircuit, EXERCISES } from "../shared/electronics.js";
import { blockProgram } from "../shared/block-program.js";
import { DEFAULT_WORLD } from "../shared/simulator.js";
import { courseTaskByLesson } from "../shared/course-practice.js";

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
const base = `/api/classes/${DEMO_CLASS}/students/${DEMO_STUDENT}`;
const other = "44444444-4444-4444-8444-444444444444";
const apps: FastifyInstance[] = [];
async function setup() {
  const app = await createApp(config);
  apps.push(app);
  return app;
}
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.restoreAllMocks();
});
const blocks = {
  blocks: {
    languageVersion: 0,
    blocks: [{ type: "easy_forward", x: 30, y: 40, fields: { COUNT: 2 } }],
  },
};

describe("teacher course journal", () => {
  it("infers course identity and checks skills on the server", async () => {
    const app = await setup();
    const send = (payload: object) =>
      app.inject({ method: "POST", url: "/api/submissions", payload });
    const shortcut = await send({
      taskId: "course-3-1",
      code: "robot.forward(6)",
    });
    expect(shortcut.statusCode).toBe(200);
    expect(shortcut.json().submission).toMatchObject({
      lesson_id: "3.1",
      success: false,
    });
    expect(shortcut.json().result.checks[0].passed).toBe(true);
    const correct = await send({
      taskId: "course-3-1",
      code: "for i in range(6):\n    robot.forward(1)",
    });
    expect(correct.json().submission.success).toBe(true);
    expect(correct.json().submission.task_snapshot.courseTask.rules).toEqual([
      "loop",
    ]);
    expect(
      (
        await send({
          taskId: "course-3-1",
          lessonId: "1.1",
          code: "robot.forward(6)",
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await send({
          taskId: "intro-route",
          lessonId: "1.1",
          code: "robot.forward(6)",
        })
      ).statusCode,
    ).toBe(400);
    const electronics = await app.inject({
      method: "POST",
      url: "/api/electronics-submissions",
      payload: {
        exercise: "blink",
        lessonId: "5.2",
        code: "led.on()",
        editorMode: "code",
        circuit: starterCircuit(),
      },
    });
    expect(electronics.statusCode).toBe(400);
  });
  it("shows actual members and saved progress without answer keys", async () => {
    const app = await setup();
    const lesson = (await app.inject("/api/lessons/1.1")).json().lesson;
    await app.inject({
      method: "POST",
      url: "/api/lessons/1.1/progress",
      payload: { stepId: lesson.steps[0].id },
    });
    const roster = await app.inject({
      url: `/api/classes/${DEMO_CLASS}/students`,
      headers: teacher,
    });
    expect(roster.json().students).toEqual([
      { id: DEMO_STUDENT, name: "Ученик · демо", role: "student" },
    ]);
    const report = await app.inject({
      url: `${base}/progress`,
      headers: teacher,
    });
    expect(report.statusCode).toBe(200);
    expect(report.headers["cache-control"]).toBe("private, no-store");
    expect(report.json().progress[0].completedStepIds).toEqual([
      lesson.steps[0].id,
    ]);
    expect(report.json().lessons).toHaveLength(12);
    expect(report.body).not.toContain("correctOptionId");
    expect(report.json().attempts).toEqual([]);
  });
  it("saves canonical blocks and immutable task context with server computed results", async () => {
    const app = await setup();
    const code = blockProgram(blocks, "robot").code;
    const result = await app.inject({
      method: "POST",
      url: "/api/submissions",
      payload: {
        taskId: "course-1-1",
        code,
        editorMode: "blocks",
        blocksState: blocks,
        lessonId: "1.1",
      },
    });
    expect(result.statusCode).toBe(200);
    const id = result.json().submission.id;
    const detail = await app.inject({
      url: `${base}/attempts/${id}?kind=robot`,
      headers: teacher,
    });
    expect(detail.json().attempt.blocks_state).toEqual(blocks);
    expect(detail.json().attempt.code).toBe(code);
    expect(detail.json().attempt.task_snapshot.world).toEqual(
      courseTaskByLesson("1.1")!.world,
    );
    expect(detail.json().attempt.success).toBe(false);
    const report = (
      await app.inject({ url: `${base}/progress`, headers: teacher })
    ).json();
    expect(report.attempts[0]).toMatchObject({
      id,
      kind: "robot",
      lesson_id: "1.1",
    });
    expect(report.attempts[0]).not.toHaveProperty("code");
    expect(report.attempts[0]).not.toHaveProperty("blocks_state");
  });
  it("rejects tampered code, block types, grade claims and invalid lesson scope", async () => {
    const app = await setup();
    const payload = {
      taskId: "intro-route",
      code: "robot.forward(99)",
      editorMode: "blocks",
      blocksState: blocks,
    };
    for (const value of [
      payload,
      {
        ...payload,
        blocksState: { blocks: { blocks: [{ type: "javascript_eval" }] } },
      },
      { taskId: "intro-route", code: "", success: true },
      { taskId: "intro-route", code: "", lessonId: "5.1" },
    ]) {
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/submissions",
            payload: value,
          })
        ).statusCode,
      ).toBe(400);
    }
    expect(
      (await app.inject({ url: `${base}/progress`, headers: teacher })).json()
        .attempts,
    ).toEqual([]);
  });
  it("stores electronics circuit and checks it on the server", async () => {
    const app = await setup();
    const body = {
      exercise: "blink",
      editorMode: "code",
      code: EXERCISES.blink.example,
      circuit: starterCircuit(),
      lessonId: "5.1",
    };
    const response = await app.inject({
      method: "POST",
      url: "/api/electronics-submissions",
      payload: body,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().result.success).toBe(true);
    const detail = await app.inject({
      url: `${base}/attempts/${response.json().submission.id}?kind=electronics`,
      headers: teacher,
    });
    expect(detail.json().attempt.circuit).toEqual(starterCircuit());
    expect(detail.json().attempt.code).toBe(body.code);
    const broken = await app.inject({
      method: "POST",
      url: "/api/electronics-submissions",
      payload: { ...body, circuit: { parts: [], wires: [] } },
    });
    expect(broken.json().result.success).toBe(false);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/electronics-submissions",
          payload: {
            ...body,
            circuit: { parts: [], wires: [{ from: "<script>", to: "x" }] },
          },
        })
      ).statusCode,
    ).toBe(400);
  });
  it("allows 0–10 grades, updates one grade and exposes it only to its student", async () => {
    const app = await setup();
    const body = {
      sectionKey: "course:1",
      score: 0,
      comment: "Попробуй ещё раз",
    };
    expect(
      (
        await app.inject({
          method: "POST",
          url: `${base}/grades`,
          payload: body,
        })
      ).statusCode,
    ).toBe(403);
    for (const score of [-1, 11, 2.5])
      expect(
        (
          await app.inject({
            method: "POST",
            url: `${base}/grades`,
            headers: teacher,
            payload: { ...body, score },
          })
        ).statusCode,
      ).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `${base}/grades`,
          headers: teacher,
          payload: body,
        })
      ).json().grade.score,
    ).toBe(0);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `${base}/grades`,
          headers: teacher,
          payload: { ...body, score: 10 },
        })
      ).json().grade.teacher_id,
    ).toBe(DEMO_TEACHER);
    const mine = await app.inject(`/api/classes/${DEMO_CLASS}/my-grades`);
    expect(mine.json().grades).toHaveLength(1);
    expect(mine.json().grades[0].score).toBe(10);
    expect(
      (
        await app.inject({
          url: `/api/classes/${DEMO_CLASS}/my-grades`,
          headers: teacher,
        })
      ).json().grades,
    ).toEqual([]);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `${base}/grades`,
          headers: teacher,
          payload: { ...body, sectionKey: `custom:${other}` },
        })
      ).statusCode,
    ).toBe(400);
  });
  it("denies other teachers, nonmembers, students and access to another class's solutions", async () => {
    const app = await setup();
    const attempt = (
      await app.inject({
        method: "POST",
        url: "/api/submissions",
        payload: { taskId: "intro-route", code: "" },
      })
    ).json().submission;
    for (const url of [
      `/api/classes/${DEMO_CLASS}/students`,
      `${base}/progress`,
      `${base}/attempts/${attempt.id}?kind=robot`,
    ])
      expect((await app.inject(url)).statusCode).toBe(403);
    expect(
      (
        await app.inject({
          url: `${base.replace(DEMO_STUDENT, other)}/progress`,
          headers: teacher,
        })
      ).statusCode,
    ).toBe(404);
    vi.spyOn(Store.prototype, "getProfile").mockImplementation(async (id) => ({
      id: id === DEMO_TEACHER ? other : id,
      name: "Test",
      role: id === DEMO_TEACHER ? "teacher" : "student",
    }));
    for (const url of [
      `/api/classes/${DEMO_CLASS}/students`,
      `${base}/progress`,
      `${base}/attempts/${attempt.id}?kind=robot`,
    ])
      expect((await app.inject({ url, headers: teacher })).statusCode).toBe(
        403,
      );
    expect(
      (
        await app.inject({
          method: "POST",
          url: `${base}/grades`,
          headers: teacher,
          payload: { sectionKey: "course:1", score: 5 },
        })
      ).statusCode,
    ).toBe(403);
  });
  it("never includes teacher test attempts or attempts belonging to a different class", async () => {
    const app = await setup();
    await app.inject({
      method: "POST",
      url: "/api/submissions",
      headers: teacher,
      payload: { taskId: "intro-route", code: "" },
    });
    const c = (
      await app.inject({
        method: "POST",
        url: "/api/classes",
        headers: teacher,
        payload: { name: "Другой класс" },
      })
    ).json().class;
    await app.inject({
      method: "POST",
      url: "/api/classes/join",
      payload: { code: c.join_code },
    });
    const task = (
      await app.inject({
        method: "POST",
        url: "/api/tasks",
        headers: teacher,
        payload: {
          classId: c.id,
          title: "Маршрут",
          description: "Дойди до финиша",
          difficulty: "easy",
          world: DEFAULT_WORLD,
        },
      })
    ).json().task;
    const attempt = (
      await app.inject({
        method: "POST",
        url: "/api/submissions",
        payload: { taskId: task.id, code: "" },
      })
    ).json().submission;
    expect(
      (await app.inject({ url: `${base}/progress`, headers: teacher })).json()
        .attempts,
    ).toEqual([]);
    expect(
      (
        await app.inject({
          url: `${base}/attempts/${attempt.id}?kind=robot`,
          headers: teacher,
        })
      ).statusCode,
    ).toBe(404);
  });
});
