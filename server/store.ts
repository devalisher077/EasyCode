import { randomBytes, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AppConfig } from "./config.js";
import type { World } from "../shared/simulator.js";
import type { LessonDefinition, LessonProgress } from "../shared/lessons.js";
import { LessonProgressUnavailable, mergeLessonProgress, type ProgressChange } from "./lessons.js";

export type Role = "student" | "teacher";
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
      this.check(error);
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
