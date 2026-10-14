import { randomBytes, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AppConfig } from "./config.js";
import type { World } from "../shared/simulator.js";
import type { LessonDefinition, LessonProgress } from "../shared/lessons.js";
import { LessonProgressUnavailable, mergeLessonProgress, type ProgressChange } from "./lessons.js";
import type { AttemptSummary, ReviewAttempt, SectionGrade } from "../shared/review.js";
import type { Circuit } from "../shared/electronics.js";

export type Role = "student" | "teacher";
export class TeacherReviewUnavailable extends Error {
  readonly statusCode = 503;
  constructor(missingSchema: boolean) {
    super(missingSchema ? "Для журнала и сохранения решений примените миграцию 202610140002_teacher_review.sql в Supabase."
      : "Журнал временно недоступен. Попробуйте ещё раз.");
  }
}
export interface Profile {
  id: string;
  name: string;
  role: Role;
}
export interface Classroom {
  id: string;
  name: string;
  join_code: string;
  teacher_id: string;
  created_at: string;
  member_count?: number;
}
export interface Section {
  id: string;
  class_id: string;
  title: string;
  theory: string;
  position: number;
}
export interface Task {
  id: string;
  class_id: string | null;
  section_id: string | null;
  title: string;
  description: string;
  difficulty: "easy" | "medium" | "hard";
  world: World;
}
export interface Submission {
  id: string;
  task_id: string;
  class_id: string | null;
  student_id: string;
  is_test: boolean;
  code: string;
  success: boolean;
  steps: number;
  feedback: string;
  editor_mode?: "code" | "blocks";
  blocks_state?: object | null;
  task_snapshot?: ReviewAttempt["task_snapshot"];
  lesson_id?: string | null;
  created_at: string;
}
export const DEMO_TEACHER = "11111111-1111-4111-8111-111111111111";
export const DEMO_STUDENT = "22222222-2222-4222-8222-222222222222";
export const DEMO_CLASS = "33333333-3333-4333-8333-333333333333";

interface LessonProgressRow {
  lesson_id: string; completed_step_ids: string[]; best_score: number | null;
  quiz_passed: boolean; completed_at: string | null; updated_at: string;
}
function toLessonProgress(row: LessonProgressRow): LessonProgress {
  return { lessonId: row.lesson_id, completedStepIds: row.completed_step_ids,
    bestScore: row.best_score, quizPassed: row.quiz_passed, completedAt: row.completed_at, updatedAt: row.updated_at };
}

/** Service-role access is confined here. Every caller must authorize class ownership/membership. */
export class Store {
  readonly supabase: SupabaseClient | null;
  private classes: Classroom[] = [
    {
      id: DEMO_CLASS,
      name: "Класс первооткрывателей",
      join_code: "EASY26",
      teacher_id: DEMO_TEACHER,
      created_at: new Date().toISOString(),
    },
  ];
  private members = [{ class_id: DEMO_CLASS, student_id: DEMO_STUDENT }];
  private sections: Section[] = [];
  private tasks: Task[] = [];
  private submissions: Submission[] = [];
  private lessonProgress = new Map<string, LessonProgress>();
  private grades: SectionGrade[] = [];
  private electronics: (ReviewAttempt & { is_test: boolean })[] = [];

  constructor(config: AppConfig) {
    this.supabase = config.demo
      ? null
      : createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
  }
  private check(error: unknown) {
    if (error)
      throw new Error("Ошибка базы данных. Проверьте миграции Supabase.");
  }
  private reviewCheck(error: unknown) {
    if (!error) return;
    const code = typeof error === "object" && "code" in error ? String(error.code) : "";
    throw new TeacherReviewUnavailable(["42P01", "42703", "PGRST204", "PGRST205"].includes(code));
  }
  private progressError(error: unknown): LessonProgressUnavailable {
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : null;
    return new LessonProgressUnavailable(["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"].includes(String(code)));
  }
  async getLessonProgress(userId: string): Promise<LessonProgress[]> {
    if (!this.supabase) return [...this.lessonProgress.entries()]
      .filter(([key]) => key.startsWith(`${userId}:`))
      .map(([, value]) => structuredClone(value));
    try {
      const { data, error } = await this.supabase.from("lesson_progress")
        .select("lesson_id,completed_step_ids,best_score,quiz_passed,completed_at,updated_at")
        .eq("user_id", userId).order("lesson_id");
      if (error) throw this.progressError(error);
      return (data || []).map(toLessonProgress);
    } catch (error) {
      throw error instanceof LessonProgressUnavailable ? error : this.progressError(error);
    }
  }
  async saveLessonProgress(userId: string, lesson: LessonDefinition, change: ProgressChange): Promise<LessonProgress> {
    if (!this.supabase) {
      const key = `${userId}:${lesson.id}`;
      const next = mergeLessonProgress(lesson, this.lessonProgress.get(key), change);
      this.lessonProgress.set(key, next);
      return structuredClone(next);
    }
    try {
      const { data, error } = await this.supabase.rpc("merge_lesson_progress", {
        p_user_id: userId, p_lesson_id: lesson.id, p_valid_step_ids: lesson.steps.map(step => step.id),
        p_step_id: change.stepId ?? null, p_score: change.score ?? null,
        p_total: change.score === undefined ? null : lesson.quiz.length,
      });
      if (error) throw this.progressError(error);
      if (!data?.[0]) throw new LessonProgressUnavailable();
      return toLessonProgress(data[0]);
    } catch (error) {
      throw error instanceof LessonProgressUnavailable ? error : this.progressError(error);
    }
  }
  async getProfile(id: string): Promise<Profile | null> {
    if (!this.supabase)
      return {
        id,
        name: id === DEMO_TEACHER ? "Учитель · демо" : "Ученик · демо",
        role: id === DEMO_TEACHER ? "teacher" : "student",
      };
    const { data, error } = await this.supabase
      .from("profiles")
      .select("id,name,role")
      .eq("id", id)
      .maybeSingle();
    this.check(error);
    return data;
  }
  async classById(id: string): Promise<Classroom | null> {
    if (!this.supabase) return this.classes.find((c) => c.id === id) || null;
    const { data, error } = await this.supabase
      .from("classes")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    this.check(error);
    return data;
  }
  async classByCode(code: string): Promise<Classroom | null> {
    if (!this.supabase)
      return this.classes.find((c) => c.join_code === code) || null;
    const { data, error } = await this.supabase
      .from("classes")
      .select("*")
      .eq("join_code", code)
      .maybeSingle();
    this.check(error);
    return data;
  }
  async isMember(classId: string, studentId: string): Promise<boolean> {
    if (!this.supabase)
      return this.members.some(
        (m) => m.class_id === classId && m.student_id === studentId,
      );
    const { data, error } = await this.supabase
      .from("class_members")
      .select("class_id")
      .eq("class_id", classId)
      .eq("student_id", studentId)
      .maybeSingle();
    this.check(error);
    return Boolean(data);
  }
  async listClasses(profile: Profile): Promise<Classroom[]> {
    if (!this.supabase)
      return this.classes
        .filter(
          (c) =>
            c.teacher_id === profile.id ||
            this.members.some(
              (m) => m.class_id === c.id && m.student_id === profile.id,
            ),
        )
        .map((c) => ({
          ...c,
          member_count: this.members.filter((m) => m.class_id === c.id).length,
        }));
    if (profile.role === "teacher") {
      const { data, error } = await this.supabase
        .from("classes")
        .select("*")
        .eq("teacher_id", profile.id)
        .order("created_at");
      this.check(error);
      return this.withMemberCounts(data || []);
    }
    const { data: memberships, error: memberError } = await this.supabase
      .from("class_members")
      .select("class_id")
      .eq("student_id", profile.id);
    this.check(memberError);
    if (!memberships?.length) return [];
    const { data, error } = await this.supabase
      .from("classes")
      .select("*")
      .in(
        "id",
        memberships.map((m) => m.class_id),
      )
      .order("created_at");
    this.check(error);
    return this.withMemberCounts(data || []);
  }
  private async withMemberCounts(classes: Classroom[]): Promise<Classroom[]> {
    return Promise.all(
      classes.map(async (classroom) => {
        const { count, error } = await this.supabase!.from("class_members")
          .select("class_id", { count: "exact", head: true })
          .eq("class_id", classroom.id);
        this.check(error);
        return { ...classroom, member_count: count || 0 };
      }),
    );
  }
  async createClass(name: string, teacherId: string): Promise<Classroom> {
    const classroom: Classroom = {
      id: randomUUID(),
      name,
      teacher_id: teacherId,
      join_code: randomBytes(6).toString("hex").toUpperCase(),
      created_at: new Date().toISOString(),
    };
    if (!this.supabase) this.classes.push(classroom);
    else {
      const { error } = await this.supabase.from("classes").insert(classroom);
      this.check(error);
    }
    return { ...classroom, member_count: 0 };
  }
  async joinClass(classId: string, studentId: string): Promise<void> {
    if (!this.supabase) {
      if (!(await this.isMember(classId, studentId)))
        this.members.push({ class_id: classId, student_id: studentId });
    } else {
      const { error } = await this.supabase
        .from("class_members")
        .upsert(
          { class_id: classId, student_id: studentId },
          { onConflict: "class_id,student_id", ignoreDuplicates: true },
        );
      this.check(error);
    }
  }
  async listSections(classId: string): Promise<Section[]> {
    if (!this.supabase)
      return this.sections.filter((s) => s.class_id === classId);
    const { data, error } = await this.supabase
      .from("sections")
      .select("*")
      .eq("class_id", classId)
      .order("position");
    this.check(error);
    return data || [];
  }
  async createSection(
    input: Omit<Section, "id" | "position">,
  ): Promise<Section> {
    const section = {
      ...input,
      id: randomUUID(),
      position: (await this.listSections(input.class_id)).length + 1,
    };
    if (!this.supabase) this.sections.push(section);
    else {
      const { error } = await this.supabase.from("sections").insert(section);
      this.check(error);
    }
    return section;
  }
  async listTasks(classId: string): Promise<Task[]> {
    if (!this.supabase) return this.tasks.filter((t) => t.class_id === classId);
    const { data, error } = await this.supabase
      .from("tasks")
      .select("*")
      .eq("class_id", classId)
      .order("created_at");
    this.check(error);
    return data || [];
  }
  async taskById(id: string): Promise<Task | null> {
    if (!this.supabase) return this.tasks.find((t) => t.id === id) || null;
    const { data, error } = await this.supabase
      .from("tasks")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    this.check(error);
    return data;
  }
  async createTask(input: Omit<Task, "id">): Promise<Task> {
    const task = { ...input, id: randomUUID() };
    if (!this.supabase) this.tasks.push(task);
    else {
      const { error } = await this.supabase.from("tasks").insert(task);
      this.check(error);
    }
    return task;
  }
  async listStudents(classId: string): Promise<Profile[]> {
    if (!this.supabase) return Promise.all(this.members.filter(m => m.class_id === classId)
      .map(m => this.getProfile(m.student_id))).then(rows => rows.filter((p): p is Profile => p?.role === "student"));
    const students: Profile[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await this.supabase.from("class_members").select("student_id")
        .eq("class_id", classId).order("student_id").range(offset, offset + 499);
      this.check(error);
      if (data?.length) {
        const profiles = await this.supabase.from("profiles").select("id,name,role")
          .in("id", data.map(m => m.student_id)).eq("role", "student");
        this.check(profiles.error); students.push(...(profiles.data || []));
      }
      if (!data || data.length < 500) return students;
    }
  }
  async listGrades(classId: string, studentId: string): Promise<SectionGrade[]> {
    if (!this.supabase) return structuredClone(this.grades.filter(g => g.class_id === classId && g.student_id === studentId));
    const { data, error } = await this.supabase.from("section_grades").select("*")
      .eq("class_id", classId).eq("student_id", studentId);
    this.reviewCheck(error); return data || [];
  }
  async saveGrade(input: Omit<SectionGrade, "updated_at">): Promise<SectionGrade> {
    const grade = { ...input, updated_at: new Date().toISOString() };
    if (!this.supabase) {
      this.grades = this.grades.filter(g => !(g.class_id === input.class_id && g.student_id === input.student_id && g.section_key === input.section_key));
      this.grades.push(grade);
    } else {
      const { error } = await this.supabase.from("section_grades").upsert(grade, { onConflict: "class_id,student_id,section_key" });
      this.reviewCheck(error);
    }
    return grade;
  }
  private reviewRows(kind: "robot" | "electronics"): ReviewAttempt[] {
    return kind === "electronics" ? this.electronics.filter(s => !s.is_test) : this.submissions.filter(s => !s.is_test).map(s => ({ ...s,
      kind: "robot", lesson_id: s.lesson_id ?? null, editor_mode: s.editor_mode ?? "code",
      blocks_state: s.blocks_state ?? null, task_snapshot: s.task_snapshot ?? null }));
  }
  async attemptSummaries(classId: string, studentId: string): Promise<AttemptSummary[]> {
    const rows: AttemptSummary[] = [];
    for (const kind of ["robot", "electronics"] as const) {
      if (!this.supabase) {
        rows.push(...this.reviewRows(kind).filter(s => s.student_id === studentId && (!s.class_id || s.class_id === classId))
          .map(({ id, task_id, lesson_id, success, created_at }) => ({ id, task_id, lesson_id, success, created_at, kind })));
        continue;
      }
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await this.supabase.from(kind === "robot" ? "submissions" : "electronics_submissions")
          .select("id,task_id,lesson_id,success,created_at").eq("student_id", studentId).eq("is_test", false)
          .or(`class_id.eq.${classId},class_id.is.null`).order("created_at").order("id").range(offset, offset + 499);
        this.reviewCheck(error); rows.push(...(data || []).map(s => ({ ...s, kind })));
        if (!data || data.length < 500) break;
      }
    }
    return rows.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
  }
  async reviewAttempt(id: string, kind: "robot" | "electronics"): Promise<ReviewAttempt | null> {
    if (!this.supabase) return this.reviewRows(kind).find(s => s.id === id) || null;
    const { data, error } = await this.supabase.from(kind === "robot" ? "submissions" : "electronics_submissions")
      .select("*").eq("id", id).eq("is_test", false).maybeSingle();
    this.reviewCheck(error); return data ? { ...data, kind, task_snapshot: data.task_snapshot ?? null } : null;
  }
  async createElectronics(input: { student_id: string; is_test: boolean; task_id: string; code: string;
    editor_mode: "code" | "blocks"; blocks_state: object | null; lesson_id: string | null;
    circuit: Circuit; success: boolean; feedback: string }) {
    const row = { ...input, id: randomUUID(), class_id: null, created_at: new Date().toISOString() };
    if (!this.supabase) this.electronics.push({ ...row, kind: "electronics", task_snapshot: null });
    else { const { error } = await this.supabase.from("electronics_submissions").insert(row); this.reviewCheck(error); }
    return row;
  }
  async createSubmission(
    input: Omit<Submission, "id" | "created_at">,
  ): Promise<Submission> {
    const submission = {
      ...input,
      id: randomUUID(),
      created_at: new Date().toISOString(),
    };
    if (!this.supabase) this.submissions.push(submission);
    else {
      const { error } = await this.supabase
        .from("submissions")
        .insert(submission);
      this.reviewCheck(error);
    }
    return submission;
  }
  async listSubmissions(
    studentId: string | null,
    classId?: string,
  ): Promise<Submission[]> {
    if (!this.supabase)
      return this.submissions
        .filter(
          (s) =>
            (studentId ? s.student_id === studentId : !s.is_test) &&
            (!classId || s.class_id === classId),
        )
        .slice(-200)
        .reverse();
    let query = this.supabase
      .from("submissions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (studentId) query = query.eq("student_id", studentId);
    else query = query.eq("is_test", false);
    if (classId) query = query.eq("class_id", classId);
    const { data, error } = await query;
    this.check(error);
    return data || [];
  }
}
