import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, RotateCcw } from "lucide-react";
import {
  dronePracticeForLesson,
  checkDronePractice,
} from "../../shared/drone-course-practice";
import { DroneWorkspace } from "./DroneLab";
import { t } from "../lib/i18n";
import "./drone-course-practice.css";

export default function DroneCoursePractice({
  lessonId,
  draftOwner,
  onNotice,
  onBack,
  onFreePractice,
}: {
  lessonId: string;
  draftOwner: string;
  onNotice: (message: string) => void;
  onBack?: () => void;
  onFreePractice?: () => void;
}) {
  const practice = dronePracticeForLesson(lessonId);
  if (!practice)
    return (
      <div className="page-container">
        <p>{t("Практика этой темы ещё готовится.")}</p>
        {onBack && (
          <button className="secondary-button" onClick={onBack}>
            {t("К уроку")}
          </button>
        )}
      </div>
    );
  return (
    <div className="page-container drone-lab drone-course-practice">
      {onBack && (
        <button className="text-button" onClick={onBack}>
          <ArrowLeft size={16} />
          {t("К уроку")}
        </button>
      )}
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {t("ПРАКТИКА КУРСА «ДРОНЫ»")} · {lessonId.replace("drone-", "")}
          </span>
          <h1>{t(practice.title)}</h1>
          <p>{t(practice.instructions)}</p>
        </div>
      </div>
      <p className="drone-practice-local">
        {t(
          "Учебная самопроверка в браузере. Она не выставляет оценку и не отправляет результат в журнал учителя.",
        )}
      </p>
      {practice.mission ? (
        <DroneWorkspace
          key={`${draftOwner}:${lessonId}`}
          mission={practice.mission}
          draftOwner={draftOwner}
          onNotice={onNotice}
          localNote="Практика темы. Сохраните черновик кнопкой; он останется в этом браузере. Результат не отправляется учителю."
        />
      ) : (
        <PracticeQuestions
          key={`${draftOwner}:${lessonId}`}
          lessonId={lessonId}
          draftOwner={draftOwner}
          onNotice={onNotice}
        />
      )}
      {onFreePractice && (
        <button
          className="text-button drone-free-link"
          onClick={onFreePractice}
        >
          {t("Открыть свободную 3D-практику")}
          <ArrowRight size={16} />
        </button>
      )}
    </div>
  );
}

function PracticeQuestions({
  lessonId,
  draftOwner,
  onNotice,
}: {
  lessonId: string;
  draftOwner: string;
  onNotice: (message: string) => void;
}) {
  const practice = dronePracticeForLesson(lessonId)!;
  const key = `easycode:drone-practice:v1:${draftOwner}:${lessonId}`;
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "{}");
      return Object.fromEntries(
        practice.questions
          .filter((q) => q.options.some((o) => o.id === value?.[q.id]))
          .map((q) => [q.id, value[q.id]]),
      );
    } catch {
      return {};
    }
  });
  const [result, setResult] =
    useState<ReturnType<typeof checkDronePractice>>(null);
  const [saved, setSaved] = useState(false);
  function check() {
    const next = checkDronePractice(lessonId, answers);
    setResult(next);
    if (!next?.complete) return;
    try {
      localStorage.setItem(key, JSON.stringify(answers));
      setSaved(true);
    } catch {
      onNotice(t("Не удалось сохранить черновик в браузере."));
    }
  }
  function reset() {
    setAnswers({});
    setResult(null);
    setSaved(false);
    try {
      localStorage.removeItem(key);
    } catch {
      /* optional local state */
    }
  }
  return (
    <div className="drone-question-workbench">
      <ol className="drone-practice-questions">
        {practice.questions.map((q, i) => (
          <li key={q.id}>
            <label htmlFor={`drone-practice-${q.id}`}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              {t(q.prompt)}
            </label>
            <select
              id={`drone-practice-${q.id}`}
              value={answers[q.id] || ""}
              onChange={(e) => {
                setAnswers((a) => ({ ...a, [q.id]: e.target.value }));
                setResult(null);
                setSaved(false);
              }}
            >
              <option value="">{t("Выберите ответ")}</option>
              {q.options.map((o) => (
                <option key={o.id} value={o.id}>
                  {t(o.text)}
                </option>
              ))}
            </select>
            {result?.complete && (
              <p
                className={
                  result.feedback[i].correct ? "correct" : "needs-work"
                }
              >
                {t(result.feedback[i].correct ? "Верно" : "Нужно исправить")}.{" "}
                {t(q.explanation)}
              </p>
            )}
          </li>
        ))}
      </ol>
      <div className="drone-practice-actions">
        <button className="primary-button" onClick={check}>
          <Check size={16} />
          {t("Проверить ответы")}
        </button>
        <button className="secondary-button" onClick={reset}>
          <RotateCcw size={16} />
          {t("Начать заново")}
        </button>
      </div>
      <div className="drone-practice-result" role="status">
        {result &&
          t(
            !result.complete
              ? "Сначала ответьте на все задания."
              : result.passed
                ? "Практика выполнена. Все ответы верны."
                : "Проверьте пояснения и исправьте ответы.",
          )}
        {result?.complete && (
          <strong>
            {result.score} / {result.total}
          </strong>
        )}
      </div>
      {saved && (
        <p className="drone-practice-local">
          {t("Ответы сохранены только в этом браузере.")}
        </p>
      )}
    </div>
  );
}
