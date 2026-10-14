import { beforeEach, expect, it, vi } from "vitest";
import { Store, TeacherReviewUnavailable } from "./store.js";
const mock = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: mock.from }),
}));
const config = {
  demo: false,
  host: "127.0.0.1",
  port: 3001,
  frontendOrigin: "http://localhost:5173",
  supabaseUrl: "https://example.supabase.co",
  supabaseServiceRoleKey: "test-only",
  openaiApiKey: "",
  openaiModel: "",
};
beforeEach(() => mock.from.mockReset());
it("reads all pages of lightweight results and scopes every query to the pupil and class", async () => {
  const queries: any[] = [];
  mock.from.mockImplementation((table) => {
    const query: any = {};
    for (const method of ["select", "eq", "or", "order"])
      query[method] = vi.fn(() => query);
    query.range = vi.fn(async (start: number) => ({
      error: null,
      data:
        table === "electronics_submissions"
          ? []
          : Array.from({ length: start === 0 ? 500 : 1 }, (_, i) => ({
              id: `${start + i}`,
              task_id: "intro-route",
              lesson_id: null,
              success: false,
              created_at: "2026-10-14T10:00:00Z",
            })),
    }));
    queries.push(query);
    return query;
  });
  const results = await new Store(config).attemptSummaries(
    "class-id",
    "student-id",
  );
  expect(results).toHaveLength(501);
  expect(queries).toHaveLength(3);
  expect(queries[1].range).toHaveBeenCalledWith(500, 999);
  for (const query of queries) {
    expect(query.select).toHaveBeenCalledWith(
      "id,task_id,lesson_id,success,created_at",
    );
    expect(query.eq).toHaveBeenCalledWith("student_id", "student-id");
    expect(query.eq).toHaveBeenCalledWith("is_test", false);
    expect(query.or).toHaveBeenCalledWith(
      "class_id.eq.class-id,class_id.is.null",
    );
  }
});
it("upserts exactly one class/student/section grade with a server timestamp", async () => {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  mock.from.mockReturnValue({ upsert });
  const input = {
    class_id: "class",
    student_id: "student",
    teacher_id: "teacher",
    section_key: "course:1",
    score: 0,
    comment: "",
  };
  const result = await new Store(config).saveGrade(input);
  expect(upsert).toHaveBeenCalledWith(
    { ...input, updated_at: expect.any(String) },
    { onConflict: "class_id,student_id,section_key" },
  );
  expect(result.score).toBe(0);
});
it("reports missing migration safely instead of returning an empty report", async () => {
  const query: any = {};
  for (const method of ["select", "eq"]) query[method] = vi.fn(() => query);
  query.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({
      error: { code: "42P01", message: "private database detail" },
    }).then(resolve);
  mock.from.mockReturnValue(query);
  await expect(
    new Store(config).listGrades("class", "student"),
  ).rejects.toBeInstanceOf(TeacherReviewUnavailable);
  await expect(
    new Store(config).listGrades("class", "student"),
  ).rejects.toThrow("202610140002_teacher_review.sql");
});
