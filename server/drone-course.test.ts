import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { readFile } from "node:fs/promises";
import { createApp } from "./app.js";
import type { AppConfig } from "./config.js";
import { droneLessons } from "../content/drone-lessons/index.js";
import { lessons } from "../content/lessons/index.js";
import { DEMO_CLASS, DEMO_STUDENT } from "./store.js";

const config: AppConfig = {
  demo: true, host: "127.0.0.1", port: 3001, frontendOrigin: "http://localhost:5173",
  supabaseUrl: "", supabaseServiceRoleKey: "", openaiApiKey: "", openaiModel: "",
};
const teacher = { "x-demo-role": "teacher" };
const apps: FastifyInstance[] = [];
async function setup(demo = true) {
  const app = await createApp(demo ? config : { ...config, demo: false, supabaseUrl: "https://example.supabase.co", supabaseServiceRoleKey: "test-key" });
  apps.push(app); return app;
}
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });

describe("separate drone course API", () => {
  it("preserves programming IDs and exposes six drone sections with only three published", async () => {
    const app = await setup();
    const original = (await app.inject("/api/catalog")).json();
    const drones = (await app.inject("/api/catalog?course=drones")).json();
    expect(original.sections.flatMap((s: { topics: { number: string }[] }) => s.topics.map(t => t.number))).toEqual(lessons.map(l => l.id));
    expect(drones.sections).toHaveLength(6);
    expect(drones.sections.slice(3).every((s: { topics: unknown[] }) => !s.topics.length)).toBe(true);
    const topics = drones.sections.flatMap((s: { topics: unknown[] }) => s.topics);
    expect(topics.map((t: { number: string }) => t.number)).toEqual(["drone-1.1", "drone-1.2", "drone-2.1", "drone-2.2", "drone-3.1", "drone-3.2"]);
    expect(topics.every((t: { lesson: { stepIds: string[] } }) => t.lesson.stepIds.length > 0)).toBe(true);
    expect(JSON.stringify(drones)).not.toContain("sourceRoot");
    expect((await app.inject("/api/catalog?course=unknown")).statusCode).toBe(400);
  });

  it("strips answer keys from drone lessons and keeps unprovided lessons unpublished", async () => {
    const app = await setup();
    for (const lesson of droneLessons) {
      const response = await app.inject(`/api/lessons/${lesson.id}`);
      expect(response.statusCode).toBe(200);
      expect(response.json().lesson.id).toBe(lesson.id);
      for (const question of response.json().lesson.quiz) {
        expect(question).not.toHaveProperty("correctOptionId");
        expect(question).not.toHaveProperty("explanation");
      }
    }
    expect((await app.inject("/api/lessons/drone-4.1")).statusCode).toBe(404);
  });

  it("keeps drone and programming progress separate and computes quiz grades on the server", async () => {
    const app = await setup();
    const drone = droneLessons[0], original = lessons[0];
    await app.inject({ method: "POST", url: `/api/lessons/${original.id}/progress`, payload: { stepId: original.steps[0].id } });
    for (const step of drone.steps) {
      expect((await app.inject({ method: "POST", url: `/api/lessons/${drone.id}/progress`, payload: { stepId: step.id } })).statusCode).toBe(200);
    }
    const answers = Object.fromEntries(drone.quiz.map(q => [q.id, q.correctOptionId]));
    const checked = (await app.inject({ method: "POST", url: `/api/lessons/${drone.id}/check`, payload: { answers } })).json();
    expect(checked.result).toMatchObject({ passed: true, score: drone.quiz.length });
    expect(checked.result.feedback.every((f: { translations: { en: string; kk: string } }) => f.translations.en && f.translations.kk)).toBe(true);
    expect(checked.progress.completedAt).toBeTruthy();
    expect((await app.inject({ method: "POST", url: `/api/lessons/${drone.id}/check`, payload: { answers, score: 100 } })).statusCode).toBe(400);
    const progress = (await app.inject("/api/lesson-progress")).json().progress;
    expect(progress).toHaveLength(2);
    expect(progress.find((p: { lessonId: string }) => p.lessonId === original.id).quizPassed).toBe(false);
    expect((await app.inject({ url: "/api/lesson-progress", headers: teacher })).json().progress).toEqual([]);
    const journal = (await app.inject({ url: `/api/classes/${DEMO_CLASS}/students/${DEMO_STUDENT}/progress`, headers: teacher })).json();
    expect(journal.progress.map((p: { lessonId: string }) => p.lessonId)).toEqual([original.id]);
    expect(journal.lessons.every((l: { id: string }) => !l.id.startsWith("drone-"))).toBe(true);
  });

  it("provides drone presentations, keeps notes teacher-only and blocks path traversal", async () => {
    const app = await setup();
    const teacherCatalog = (await app.inject({ url: "/api/catalog?course=drones", headers: teacher })).json();
    const studentCatalog = (await app.inject("/api/catalog?course=drones")).json();
    const topic = teacherCatalog.sections[0].topics[0];
    const presentation = topic.materials.find((m: { type: string }) => m.type === "presentation");
    const notes = topic.materials.find((m: { audience: string }) => m.audience === "teacher");
    expect(presentation.path).toMatch(/^drones\//);
    expect(studentCatalog.sections[0].topics[0].materials).not.toContainEqual(notes);
    const preview = await app.inject(`/api/materials/preview?path=${encodeURIComponent(presentation.path)}`);
    expect(preview.statusCode).toBe(200);
    expect(preview.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
    expect((await app.inject(`/api/materials?path=${encodeURIComponent(notes.path)}`)).statusCode).toBe(403);
    const noteDownload = await app.inject({ url: `/api/materials?path=${encodeURIComponent(notes.path)}`, headers: teacher });
    expect(noteDownload.statusCode).toBe(200);
    expect(noteDownload.rawPayload.subarray(0, 2).toString()).toBe("PK");
    for (const path of ["drones/../materials/catalog.json", "drones/../../.env", presentation.path.replace(/\.pptx$/, ".pdf")]) {
      expect((await app.inject(`/api/materials/preview?path=${encodeURIComponent(path)}`)).statusCode).toBe(404);
    }
  });

  it("allows guest theory but requires real authentication for material and progress access", async () => {
    const app = await setup(false);
    expect((await app.inject("/api/catalog?course=drones")).statusCode).toBe(200);
    expect((await app.inject("/api/lessons/drone-1.1")).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/api/lessons/drone-1.1/progress", payload: { stepId: droneLessons[0].steps[0].id }, headers: teacher })).statusCode).toBe(401);
    expect((await app.inject("/api/materials/preview?path=drones/test.pptx")).statusCode).toBe(401);
  });

  it("migration preserves private writes and separate namespaces", async () => {
    const sql = await readFile("supabase/migrations/202611110001_drone_lesson_progress.sql", "utf8");
    expect(sql).toContain("drone-[1-6]");
    expect(sql).toContain("security invoker");
    expect(sql).toContain("revoke all on public.lesson_progress from public, anon, authenticated");
    expect(sql).toContain("grant select on public.lesson_progress to authenticated");
    expect(sql).toContain("using (user_id = auth.uid())");
    expect(sql).not.toMatch(/delete from|truncate|drop table/i);
    const vite = await readFile("vite.config.ts", "utf8");
    expect(vite).toContain('"**/content/drone-materials/**"');
    expect(vite).toContain('"**/content/drone-lessons/**"');
  });
});
