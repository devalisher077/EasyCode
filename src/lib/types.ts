import type { World } from "../../shared/simulator";
export type Role = "student" | "teacher";
export type Profile = { id: string; name: string; role: Role };
export type Material = { type: string; audience: string; path: string; title?: string; filename?: string };
export type Topic = {
  number: string;
  title: string;
  materials: Material[];
  lesson?: { stepIds: string[]; durationMinutes: number };
};
export type Section = { number: number; title: string; topics: Topic[] };
export type Catalog = {
  course: { title: string; product: string; target_grades: string };
  sections: Section[];
};
export type Classroom = {
  id: string;
  name: string;
  join_code: string;
  teacher_id: string;
  member_count?: number;
};
export type CustomSection = {
  id: string;
  class_id: string;
  title: string;
  theory: string;
  position: number;
};
export type Task = {
  id: string;
  class_id: string | null;
  section_id?: string | null;
  title: string;
  description: string;
  difficulty: string;
  world: World;
};
export type Submission = {
  id: string;
  task_id: string;
  student_id: string;
  success: boolean;
  score?: number;
  created_at: string;
  result?: { success: boolean; message: string; steps: number };
};
