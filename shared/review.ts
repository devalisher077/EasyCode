import type { LessonProgress } from "./lessons.js";
import type { World } from "./simulator.js";
import type { Circuit } from "./electronics.js";

export type EditorMode = "code" | "blocks";
export interface SectionGrade {
  class_id: string;
  student_id: string;
  section_key: string;
  teacher_id: string;
  score: number;
  comment: string;
  updated_at: string;
}
export interface AttemptSummary {
  id: string;
  task_id: string;
  lesson_id: string | null;
  success: boolean;
  created_at: string;
  kind: "robot" | "electronics";
}
export interface ReviewAttempt extends AttemptSummary {
  student_id: string;
  class_id: string | null;
  code: string;
  feedback: string;
  editor_mode: EditorMode;
  blocks_state: object | null;
  task_snapshot: {
    title: string;
    description: string;
    world: World;
    courseTask?: import("./course-practice.js").CourseRobotTask;
  } | null;
  circuit?: Circuit;
}
export interface StudentReport {
  progress: LessonProgress[];
  attempts: AttemptSummary[];
  grades: SectionGrade[];
  lessons: {
    id: string;
    title: string;
    sectionNumber: number;
    sectionTitle: string;
    stepIds: string[];
    stepTitles: string[];
    quizTotal: number;
  }[];
}
