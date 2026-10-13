import { lessons } from "../content/lessons/index.js";
import localizedFeedback from './locales/lesson-feedback.json';
import type { Lesson, LessonDefinition, LessonProgress, QuizResult } from "../shared/lessons.js";

export class LessonProgressUnavailable extends Error {
  readonly statusCode = 503;
  constructor(migrationMissing = false) {
    super(migrationMissing
      ? "Прогресс не сохранён: примените миграцию 202610070001_lesson_progress.sql в Supabase."
      : "Хранилище прогресса временно недоступно. Результат не сохранён; попробуйте ещё раз.");
  }
}

export const findLesson = (id: string): LessonDefinition | undefined => lessons.find(lesson => lesson.id === id);

/** Answer keys and explanations stay on the server until an assessment is submitted. */
export function publicLesson(lesson: LessonDefinition): Lesson {
  return { ...lesson, quiz: lesson.quiz.map(({ id, prompt, options }) => ({ id, prompt, options })) };
}

export function validQuizAnswers(lesson: LessonDefinition, answers: Record<string, string>): boolean {
  return Object.keys(answers).length === lesson.quiz.length
    && lesson.quiz.every(question => Object.hasOwn(answers, question.id)
      && question.options.some(option => option.id === answers[question.id]));
}

export function assessLesson(lesson: LessonDefinition, answers: Record<string, string>): QuizResult {
  if (!validQuizAnswers(lesson, answers)) throw new Error("Ответьте на все вопросы и выберите существующие варианты.");
  const feedback = lesson.quiz.map(question => ({ questionId: question.id, correct: answers[question.id] === question.correctOptionId, explanation: question.explanation, translations: (localizedFeedback as Record<string, { en: string; kk: string }>)[question.id] }));
  const score = feedback.filter(answer => answer.correct).length;
  return { score, total: lesson.quiz.length, passed: score === lesson.quiz.length, feedback };
}

export interface ProgressChange { stepId?: string; score?: number }

/** Same monotonic merge rules as merge_lesson_progress SQL RPC. */
export function mergeLessonProgress(
  lesson: LessonDefinition,
  previous: LessonProgress | undefined,
  change: ProgressChange,
  now = new Date().toISOString(),
): LessonProgress {
  if (change.stepId !== undefined && !lesson.steps.some(step => step.id === change.stepId)) throw new Error("Шаг не принадлежит уроку.");
  if (change.score !== undefined && (!Number.isInteger(change.score) || change.score < 0 || change.score > lesson.quiz.length)) throw new Error("Некорректный результат проверки.");
  const completedStepIds = [...new Set([...(previous?.completedStepIds || []), ...(change.stepId ? [change.stepId] : [])])].sort();
  const quizPassed = Boolean(previous?.quizPassed || change.score === lesson.quiz.length);
  const bestScore = change.score === undefined ? previous?.bestScore ?? null : Math.max(previous?.bestScore ?? 0, change.score);
  const completed = quizPassed && lesson.steps.every(step => completedStepIds.includes(step.id));
  return {
    lessonId: lesson.id, completedStepIds, bestScore, quizPassed,
    completedAt: previous?.completedAt || (completed ? now : null), updatedAt: now,
  };
}
