import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Lesson,
  LessonCheckResponse,
  LessonProgress,
  QuizResult,
} from "../../shared/lessons";
import { api } from "./api";

export type LessonStorage = "loading" | "cloud" | "local" | "unavailable";
type ProgressMap = Record<string, LessonProgress>;
type Snapshot = {
  scope: string;
  progress: ProgressMap;
  storage: LessonStorage;
  error: string;
};

function isProgress(value: unknown): value is LessonProgress {
  if (!value || typeof value !== "object") return false;
  const item = value as LessonProgress;
  return (
    typeof item.lessonId === "string" &&
    Array.isArray(item.completedStepIds) &&
    item.completedStepIds.every((id) => typeof id === "string") &&
    (item.bestScore === null ||
      (typeof item.bestScore === "number" &&
        Number.isFinite(item.bestScore))) &&
    typeof item.quizPassed === "boolean" &&
    (item.completedAt === null || typeof item.completedAt === "string") &&
    typeof item.updatedAt === "string"
  );
}

function readLocal(key: string): ProgressMap {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    return Object.fromEntries(
      Object.values(parsed)
        .filter(isProgress)
        .map((item) => [item.lessonId, item]),
    );
  } catch {
    return {};
  }
}

function persistLocal(key: string, progress: ProgressMap): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}

function combineProgress(
  lesson: Lesson,
  previous: LessonProgress | undefined,
  incoming: Partial<LessonProgress>,
): LessonProgress {
  const now = new Date().toISOString();
  const completedStepIds = lesson.steps
    .filter(
      (step) =>
        previous?.completedStepIds.includes(step.id) ||
        incoming.completedStepIds?.includes(step.id),
    )
    .map((step) => step.id);
  const quizPassed = Boolean(previous?.quizPassed || incoming.quizPassed);
  const scores = [previous?.bestScore, incoming.bestScore].filter(
    (value): value is number => typeof value === "number",
  );
  const completed =
    completedStepIds.length === lesson.steps.length && quizPassed;
  return {
    lessonId: lesson.id,
    completedStepIds,
    bestScore: scores.length ? Math.max(...scores) : null,
    quizPassed,
    completedAt: completed
      ? previous?.completedAt || incoming.completedAt || now
      : null,
    updatedAt: incoming.updatedAt || now,
  };
}

const localWarning =
  "Облачный прогресс сейчас недоступен. Изменения сохраняются только в этом браузере и не синхронизируются автоматически.";
const unavailableWarning =
  "Браузер не разрешил сохранить прогресс. Он доступен только до закрытия или обновления страницы.";

export function useLessonProgress({
  ownerId,
  cloud,
  enabled,
  demo = false,
}: {
  ownerId: string;
  cloud: boolean;
  enabled: boolean;
  demo?: boolean;
}) {
  const scope = JSON.stringify([ownerId, cloud, enabled, demo]);
  const key = `easycode:lesson-progress:v1:${encodeURIComponent(ownerId || "guest")}`;
  const [revision, setRevision] = useState(0);
  const [snapshot, setSnapshot] = useState<Snapshot>({
    scope,
    progress: {},
    storage: "loading",
    error: "",
  });
  const snapshotRef = useRef(snapshot);
  const scopeRef = useRef(scope);
  const generation = useRef(0);
  scopeRef.current = scope;

  const apply = useCallback((next: Snapshot) => {
    if (scopeRef.current !== next.scope) return;
    snapshotRef.current = next;
    setSnapshot(next);
  }, []);

  useEffect(() => {
    const token = ++generation.current;
    const current = () =>
      scopeRef.current === scope && generation.current === token;
    apply({ scope, progress: {}, storage: "loading", error: "" });
    if (!enabled) return;
    const fallback = (warning = "") => {
      if (!current()) return;
      const progress = readLocal(key);
      const available = persistLocal(key, progress);
      apply({
        scope,
        progress,
        storage: available ? "local" : "unavailable",
        error: available ? warning : unavailableWarning,
      });
    };
    if (!cloud) {
      fallback();
    } else {
      api<{ progress: LessonProgress[] }>(
        "/lesson-progress",
        undefined,
        demo ? undefined : { expectedUserId: ownerId },
      )
        .then((data) => {
          if (!current()) return;
          const progress = Object.fromEntries(
            data.progress
              .filter(isProgress)
              .map((item) => [item.lessonId, item]),
          );
          persistLocal(key, progress);
          apply({ scope, progress, storage: "cloud", error: "" });
        })
        .catch(() => fallback(localWarning));
    }
    return () => {
      generation.current++;
    };
  }, [scope, key, cloud, enabled, demo, ownerId, revision, apply]);

  const markStep = useCallback(
    async (lesson: Lesson, stepId: string) => {
      if (!enabled || !lesson.steps.some((step) => step.id === stepId)) return;
      const token = generation.current;
      const current = () =>
        scopeRef.current === scope && generation.current === token;
      const initial = snapshotRef.current;
      if (initial.scope !== scope || initial.storage === "loading")
        throw new Error("Подожди, загружаем прогресс.");
      let incoming: Partial<LessonProgress> = { completedStepIds: [stepId] };
      let remote = cloud && initial.storage === "cloud";
      let warning = initial.error;
      if (remote) {
        try {
          const response = await api<{ progress: LessonProgress }>(
            `/lessons/${encodeURIComponent(lesson.id)}/progress`,
            { stepId },
            demo ? undefined : { expectedUserId: ownerId },
          );
          incoming = response.progress;
        } catch {
          remote = false;
          warning = localWarning;
        }
      }
      if (!current()) return;
      const latest = snapshotRef.current;
      remote = remote && latest.storage === "cloud";
      if (cloud && !remote) warning = latest.error || localWarning;
      if (!cloud) warning = "";
      const entry = combineProgress(
        lesson,
        latest.progress[lesson.id],
        incoming,
      );
      const progress = { ...latest.progress, [lesson.id]: entry };
      const available = persistLocal(key, progress);
      apply({
        scope,
        progress,
        storage: remote ? "cloud" : available ? "local" : "unavailable",
        error: remote ? "" : available ? warning : unavailableWarning,
      });
    },
    [scope, key, cloud, enabled, demo, ownerId, apply],
  );

  const checkQuiz = useCallback(
    async (
      lesson: Lesson,
      answers: Record<string, string>,
    ): Promise<QuizResult> => {
      if (!enabled) throw new Error("Подожди, загружаем профиль.");
      if (
        snapshotRef.current.scope !== scope ||
        snapshotRef.current.storage === "loading"
      )
        throw new Error("Подожди, загружаем прогресс.");
      const token = generation.current;
      const current = () =>
        scopeRef.current === scope && generation.current === token;
      const response = await api<LessonCheckResponse>(
        `/lessons/${encodeURIComponent(lesson.id)}/check`,
        { answers },
        !cloud
          ? { anonymous: true }
          : demo
            ? undefined
            : { expectedUserId: ownerId },
      );
      if (!current()) throw new Error("Аккаунт изменился. Открой тему заново.");
      const latest = snapshotRef.current;
      // A successful quiz request does not upload any steps kept in the local fallback.
      const remote =
        cloud && latest.storage === "cloud" && response.progress !== null;
      const entry = combineProgress(
        lesson,
        latest.progress[lesson.id],
        remote
          ? response.progress!
          : {
              bestScore: response.result.score,
              quizPassed: response.result.passed,
            },
      );
      const progress = { ...latest.progress, [lesson.id]: entry };
      const available = persistLocal(key, progress);
      const warning = response.warning
        ? `${response.warning} ${localWarning}`
        : cloud
          ? localWarning
          : "";
      apply({
        scope,
        progress,
        storage: remote ? "cloud" : available ? "local" : "unavailable",
        error: remote ? "" : available ? warning : unavailableWarning,
      });
      return response.result;
    },
    [scope, key, cloud, enabled, demo, ownerId, apply],
  );

  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const visible: Pick<Snapshot, "progress" | "storage" | "error"> =
    snapshot.scope === scope
      ? snapshot
      : { progress: {}, storage: "loading", error: "" };
  return {
    progress: visible.progress,
    storage: visible.storage,
    error: visible.error,
    markStep,
    checkQuiz,
    refresh,
  };
}
