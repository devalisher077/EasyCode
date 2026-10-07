import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { lessons } from "../content/lessons/index.js";
import type { LessonDefinition, LessonProgress } from "../shared/lessons.js";
import { createApp } from "./app.js";
import type { AppConfig } from "./config.js";
import { Store } from "./store.js";
import { assessLesson, LessonProgressUnavailable, mergeLessonProgress, publicLesson, validQuizAnswers } from "./lessons.js";

const config: AppConfig = { demo: true, host: "127.0.0.1", port: 3001, frontendOrigin: "http://localhost:5173", supabaseUrl: "", supabaseServiceRoleKey: "", openaiApiKey: "", openaiModel: "" };
const teacher = { "x-demo-role": "teacher" };
const apps: FastifyInstance[] = [];
async function setup(demo = true) {
  const app = await createApp(demo ? config : { ...config, demo: false, supabaseUrl: "https://example.supabase.co", supabaseServiceRoleKey: "test-server-key" });
  apps.push(app); return app;
}
const correctAnswers = (lesson: LessonDefinition) => Object.fromEntries(lesson.quiz.map(question => [question.id, question.correctOptionId]));
const incorrectAnswers = (lesson: LessonDefinition) => Object.fromEntries(lesson.quiz.map(question => [question.id, question.options.find(option => option.id !== question.correctOptionId)!.id]));
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); vi.restoreAllMocks(); });

describe("server-only lesson definitions", () => {
  it("contains all 12 valid lessons and never publishes answer keys", async () => {
    expect(lessons).toHaveLength(12);
    expect(new Set(lessons.map(lesson => lesson.id)).size).toBe(12);
    const app = await setup();
    for (const lesson of lessons) {
      expect(lesson.steps).toHaveLength(4);
      expect(lesson.quiz).toHaveLength(3);
      expect(new Set(lesson.steps.map(step => step.id)).size).toBe(4);
      expect(new Set(lesson.quiz.map(question => question.id)).size).toBe(3);
      for (const question of lesson.quiz) {
        expect(question.options.some(option => option.id === question.correctOptionId)).toBe(true);
        expect(question.explanation.trim()).not.toBe("");
      }
      const response = await app.inject(`/api/lessons/${lesson.id}`);
      expect(response.statusCode).toBe(200);
      expect(response.json().lesson).toEqual(publicLesson(lesson));
      for (const question of response.json().lesson.quiz) {
        expect(question).not.toHaveProperty("correctOptionId");
        expect(question).not.toHaveProperty("explanation");
      }
    }
    const catalog = (await app.inject("/api/catalog")).json();
    for (const topic of catalog.sections.flatMap((section: { topics: unknown[] }) => section.topics)) {
      expect(topic.lesson.stepIds).toHaveLength(4);
      expect(topic.lesson.durationMinutes).toBeGreaterThan(0);
    }
    expect((await app.inject("/api/lessons/9.9")).statusCode).toBe(404);
  });
  it("requires exact question IDs and real options; only all-correct passes", () => {
    const lesson = lessons[0];
    const answers = correctAnswers(lesson);
    expect(assessLesson(lesson, answers)).toMatchObject({ score: 3, total: 3, passed: true });
    expect(assessLesson(lesson, incorrectAnswers(lesson))).toMatchObject({ score: 0, passed: false });
    expect(validQuizAnswers(lesson, { ...answers, extra: "a" })).toBe(false);
    expect(validQuizAnswers(lesson, { [lesson.quiz[0].id]: answers[lesson.quiz[0].id] })).toBe(false);
    expect(validQuizAnswers(lesson, { ...answers, [lesson.quiz[0].id]: "not-an-option" })).toBe(false);
  });
  it("keeps progress monotonic and completes only after reading and passing", () => {
    const lesson = lessons[0];
    let progress: LessonProgress | undefined;
    for (const step of lesson.steps) progress = mergeLessonProgress(lesson, progress, { stepId: step.id }, "2026-10-07T10:00:00.000Z");
    expect(progress!.completedAt).toBeNull();
    progress = mergeLessonProgress(lesson, progress, { score: 3 }, "2026-10-07T10:01:00.000Z");
    expect(progress.completedAt).toBe("2026-10-07T10:01:00.000Z");
    progress = mergeLessonProgress(lesson, progress, { score: 0 }, "2026-10-07T10:02:00.000Z");
    progress = mergeLessonProgress(lesson, progress, { stepId: lesson.steps[0].id }, "2026-10-07T10:03:00.000Z");
    expect(progress.completedStepIds).toHaveLength(4);
    expect(progress.bestScore).toBe(3);
    expect(progress.quizPassed).toBe(true);
    expect(progress.completedAt).toBe("2026-10-07T10:01:00.000Z");
    expect(mergeLessonProgress(lesson, undefined, { score: 3 }).completedAt).toBeNull();
  });
});

describe("lesson progress API", () => {
  it("isolates caller progress, validates steps and rejects forged fields", async () => {
    const app = await setup();
    const lesson = lessons[0];
    const path = `/api/lessons/${lesson.id}/progress`;
    expect((await app.inject({ method: "POST", url: path, payload: { stepId: "unknown" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: path, payload: { stepId: lesson.steps[0].id, userId: "another-user", bestScore: 3 } })).statusCode).toBe(400);
    expect((await app.inject("/api/lesson-progress")).json().progress).toEqual([]);
    await Promise.all(lesson.steps.map(step => app.inject({ method: "POST", url: path, payload: { stepId: step.id } })));
    const pupil = (await app.inject("/api/lesson-progress?userId=another-user")).json().progress;
    expect(pupil).toHaveLength(1);
    expect(pupil[0].completedStepIds).toHaveLength(4);
    expect(pupil[0].completedAt).toBeNull();
    expect((await app.inject({ url: "/api/lesson-progress", headers: teacher })).json().progress).toEqual([]);
    const passed = await app.inject({ method: "POST", url: `/api/lessons/${lesson.id}/check`, payload: { answers: correctAnswers(lesson) } });
    expect(passed.json().progress).toMatchObject({ bestScore: 3, quizPassed: true });
    expect(passed.json().progress.completedAt).toBeTruthy();
    const failed = await app.inject({ method: "POST", url: `/api/lessons/${lesson.id}/check`, payload: { answers: incorrectAnswers(lesson) } });
    expect(failed.json().result.passed).toBe(false);
    expect(failed.json().progress.completedAt).toBe(passed.json().progress.completedAt);
    expect(failed.json().progress.bestScore).toBe(3);
  });
  it("rejects incomplete, extra, invalid or forged assessments", async () => {
    const app = await setup();
    const lesson = lessons[0];
    const url = `/api/lessons/${lesson.id}/check`;
    for (const payload of [
      { answers: {} },
      { answers: { ...correctAnswers(lesson), extra: "a" } },
      { answers: { ...correctAnswers(lesson), [lesson.quiz[0].id]: "invalid" } },
      { answers: correctAnswers(lesson), score: 3, quizPassed: true },
      { answers: [] },
    ]) expect((await app.inject({ method: "POST", url, payload })).statusCode).toBe(400);
    expect((await app.inject("/api/lesson-progress")).json().progress).toEqual([]);
  });
  it("permits guest reading/checks without database calls, not private writes", async () => {
    const app = await setup(false);
    const lesson = lessons[0];
    const profileSpy = vi.spyOn(Store.prototype, "getProfile");
    const saveSpy = vi.spyOn(Store.prototype, "saveLessonProgress");
    expect((await app.inject(`/api/lessons/${lesson.id}`)).statusCode).toBe(200);
    const check = await app.inject({ method: "POST", url: `/api/lessons/${lesson.id}/check`, payload: { answers: correctAnswers(lesson) }, headers: teacher });
    expect(check.statusCode).toBe(200);
    expect(check.json()).toMatchObject({ result: { passed: true }, progress: null });
    expect(check.json()).not.toHaveProperty("warning");
    expect(profileSpy).not.toHaveBeenCalled();
    expect(saveSpy).not.toHaveBeenCalled();
    expect((await app.inject("/api/lesson-progress")).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: `/api/lessons/${lesson.id}/progress`, payload: { stepId: lesson.steps[0].id } })).statusCode).toBe(401);
    expect((await app.inject("/api/materials?path=course-plan%2FПлан%20разделов.docx")).statusCode).toBe(401);
    expect((await app.inject({ url: `/api/lessons/${lesson.id}`, headers: { authorization: "malformed" } })).statusCode).toBe(401);
  });
  it("returns the computed assessment and an honest warning when saving fails", async () => {
    const app = await setup();
    const lesson = lessons[0];
    vi.spyOn(Store.prototype, "saveLessonProgress").mockRejectedValue(new LessonProgressUnavailable(true));
    vi.spyOn(Store.prototype, "getLessonProgress").mockRejectedValue(new LessonProgressUnavailable(true));
    const check = await app.inject({ method: "POST", url: `/api/lessons/${lesson.id}/check`, payload: { answers: correctAnswers(lesson) } });
    expect(check.statusCode).toBe(200);
    expect(check.json()).toMatchObject({ result: { score: 3, passed: true }, progress: null });
    expect(check.json().warning).toContain("202610070001_lesson_progress.sql");
    expect((await app.inject("/api/lesson-progress")).statusCode).toBe(503);
    const save = await app.inject({ method: "POST", url: `/api/lessons/${lesson.id}/progress`, payload: { stepId: lesson.steps[0].id } });
    expect(save.statusCode).toBe(503);
    expect(save.json().error).toContain("202610070001_lesson_progress.sql");
  });
});
