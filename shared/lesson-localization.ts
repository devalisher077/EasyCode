import type { Lesson, QuizResult } from "./lessons";
import { translate, type Language } from "./i18n";
import en from "./locales/lessons-en.json";
import kk from "./locales/lessons-kk.json";

export interface LessonCopy {
  description: string;
  goals: string[];
  steps: [string, string[]][];
  quiz: [string, string[]][];
  practice: [string, string[]];
}
export const lessonCopies = { en, kk } as unknown as Record<
  "en" | "kk",
  Record<string, LessonCopy>
>;

/** Presentation-only adaptation. IDs, code, grading and progress remain unchanged. */
export function localizeLesson(lesson: Lesson, language: Language): Lesson {
  if (language === "ru") return lesson;
  const copy = lessonCopies[language][lesson.id];
  if (!copy) return lesson;
  return {
    ...lesson,
    title: translate(lesson.title, language),
    sectionTitle: translate(lesson.sectionTitle, language),
    description: copy.description,
    goals: copy.goals,
    steps: lesson.steps.map((step, index) => ({
      ...step,
      title: copy.steps[index][0],
      paragraphs: copy.steps[index][1],
      // Localized paragraphs incorporate the original bullet lists and callouts.
      bullets: undefined,
      callout: undefined,
    })),
    quiz: lesson.quiz.map((question, index) => ({
      ...question,
      prompt: copy.quiz[index][0],
      options: question.options.map((option, i) => ({
        ...option,
        text: copy.quiz[index][1][i],
      })),
    })),
    practice: {
      ...lesson.practice,
      title: copy.practice[0],
      instructions: copy.practice[1],
    },
    source: {
      ...lesson.source,
      label:
        language === "en"
          ? "Localized learning version based on the original course materials. Attached documents remain in their original language."
          : "Курстың бастапқы материалдары негізінде бейімделген оқу нұсқасы. Тіркелген құжаттар түпнұсқа тілінде қалады.",
    },
  };
}
export function localizeQuizResult(
  lesson: Lesson,
  result: QuizResult,
  language: Language,
): QuizResult {
  if (language === "ru") return result;
  const copy = lessonCopies[language][lesson.id];
  if (!copy) return result;
  return {
    ...result,
    feedback: result.feedback.map((feedback) => {
      return {
        ...feedback,
        explanation: feedback.translations?.[language] ?? feedback.explanation,
      };
    }),
  };
}
