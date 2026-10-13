export interface LessonStep {
  id: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
  code?: string;
  callout?: { title: string; text: string };
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: { id: string; text: string }[];
}

export interface Lesson {
  id: string;
  title: string;
  sectionNumber: number;
  sectionTitle: string;
  description: string;
  durationMinutes: number;
  goals: string[];
  steps: LessonStep[];
  quiz: QuizQuestion[];
  practice: {
    title: string;
    instructions: string[];
    availableInSimulator: boolean;
  };
  source: { kind: "adapted" | "new"; label: string };
}

/** Only the API imports definitions with answer keys. */
export interface LessonDefinition extends Omit<Lesson, "quiz"> {
  quiz: (QuizQuestion & { correctOptionId: string; explanation: string })[];
}

export interface LessonProgress {
  lessonId: string;
  completedStepIds: string[];
  bestScore: number | null;
  quizPassed: boolean;
  completedAt: string | null;
  updatedAt: string;
}

export interface QuizResult {
  score: number;
  total: number;
  passed: boolean;
  feedback: {
    questionId: string;
    correct: boolean;
    explanation: string;
    translations?: { en: string; kk: string };
  }[];
}

export interface LessonCheckResponse {
  result: QuizResult;
  progress: LessonProgress | null;
  warning?: string;
}

export function lessonPercent(
  lesson: { steps: { id: string }[] },
  progress?: LessonProgress,
) {
  if (!progress) return 0;
  const read = lesson.steps.filter((step) =>
    progress.completedStepIds.includes(step.id),
  ).length;
  return Math.round(
    ((read + Number(progress.quizPassed)) / (lesson.steps.length + 1)) * 100,
  );
}
