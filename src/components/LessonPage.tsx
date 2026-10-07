import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Clock3,
  CloudCheck,
  Flag,
  Lightbulb,
  ListChecks,
  LoaderCircle,
  Monitor,
  Play,
  Presentation,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import {
  lessonPercent,
  type Lesson,
  type LessonProgress,
  type QuizResult,
} from "../../shared/lessons";
import { api } from "../lib/api";
import type { LessonStorage } from "../lib/useLessonProgress";
import type { Material } from "../lib/types";
import "./lesson.css";

type Props = {
  lessonId: string;
  progress: LessonProgress | undefined;
  storage: LessonStorage;
  storageError: string;
  onReadStep: (lesson: Lesson, id: string) => Promise<void>;
  onCheckQuiz: (
    lesson: Lesson,
    answers: Record<string, string>,
  ) => Promise<QuizResult>;
  onBack: () => void;
  onNavigateLesson: (id: string) => void;
  onPractice: () => void;
  onSignIn: () => void;
  materials: Material[];
  onPreview: (material: Material) => void;
  onDownload: (material: Material) => void;
};

function followingLesson(id: string) {
  const match = /^(\d+)\.([12])$/.exec(id);
  if (!match) return null;
  const section = Number(match[1]);
  return match[2] === "1"
    ? `${section}.2`
    : section < 6
      ? `${section + 1}.1`
      : null;
}

export function LessonPage({
  lessonId,
  progress,
  storage,
  storageError,
  onReadStep,
  onCheckQuiz,
  onBack,
  onNavigateLesson,
  onPractice,
  onSignIn,
  materials,
  onPreview,
  onDownload,
}: Props) {
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const resultBox = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  const resumedLesson = useRef("");

  useEffect(() => {
    const token = ++generation.current;
    setLoading(true);
    setLesson(null);
    setLoadError("");
    setSelected(0);
    setAnswers({});
    setResult(null);
    setBusy(false);
    setActionError("");
    resumedLesson.current = "";
    api<{ lesson: Lesson }>(`/lessons/${encodeURIComponent(lessonId)}`)
      .then((data) => {
        if (generation.current !== token) return;
        setLesson(data.lesson);
        setLoading(false);
      })
      .catch((error) => {
        if (generation.current !== token) return;
        setLoadError(
          error instanceof Error ? error.message : "Не удалось загрузить тему.",
        );
        setLoading(false);
      });
    return () => {
      generation.current++;
    };
  }, [lessonId, reload]);

  useEffect(() => {
    if (lesson) document.title = `${lesson.title} — EasyCode`;
  }, [lesson]);

  useEffect(() => {
    if (!lesson || storage === "loading" || resumedLesson.current === lesson.id)
      return;
    resumedLesson.current = lesson.id;
    const firstUnread = lesson.steps.findIndex(
      (step) => !progress?.completedStepIds.includes(step.id),
    );
    setSelected(firstUnread < 0 ? lesson.steps.length : firstUnread);
  }, [lesson, progress, storage]);

  function openStep(index: number) {
    if (lesson) resumedLesson.current = lesson.id;
    setSelected(index);
    setActionError("");
    requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true });
      heading.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      });
    });
  }

  async function readAndContinue() {
    if (!lesson || busy || selected >= lesson.steps.length) return;
    const token = generation.current;
    const step = lesson.steps[selected];
    setBusy(true);
    setActionError("");
    try {
      if (!progress?.completedStepIds.includes(step.id))
        await onReadStep(lesson, step.id);
      if (generation.current === token) openStep(selected + 1);
    } catch (error) {
      if (generation.current === token)
        setActionError(
          error instanceof Error
            ? error.message
            : "Не удалось отметить шаг. Повторите попытку.",
        );
    } finally {
      if (generation.current === token) setBusy(false);
    }
  }

  async function checkAnswers(event: React.FormEvent) {
    event.preventDefault();
    if (
      !lesson ||
      busy ||
      !lesson.quiz.every((question) => answers[question.id])
    )
      return;
    const token = generation.current;
    setBusy(true);
    setActionError("");
    try {
      const checked = await onCheckQuiz(lesson, answers);
      if (generation.current !== token) return;
      setResult(checked);
      requestAnimationFrame(() => resultBox.current?.focus());
    } catch (error) {
      if (generation.current === token)
        setActionError(
          error instanceof Error
            ? error.message
            : "Не удалось проверить ответы. Повторите попытку.",
        );
    } finally {
      if (generation.current === token) setBusy(false);
    }
  }

  if (loading)
    return (
      <div className="lesson-state" role="status">
        <LoaderCircle className="lesson-spinner" size={26} />
        <h1>Загрузка темы…</h1>
        <p>Загружаются теория, примеры и проверочные вопросы.</p>
      </div>
    );
  if (!lesson || loadError)
    return (
      <div className="lesson-state" role="alert">
        <BookOpen size={30} />
        <h1>Не удалось открыть тему</h1>
        <p>{loadError || "Такой темы пока нет в курсе."}</p>
        <div>
          <button className="secondary-button" onClick={onBack}>
            <ArrowLeft size={15} />К курсу
          </button>
          <button
            className="primary-button"
            onClick={() => setReload((value) => value + 1)}
          >
            <RotateCcw size={15} />
            Повторить загрузку
          </button>
        </div>
      </div>
    );

  const activeStep = lesson.steps[selected];
  const quizView = selected >= lesson.steps.length;
  const percent = lessonPercent(lesson, progress);
  const readCount = lesson.steps.filter((step) =>
    progress?.completedStepIds.includes(step.id),
  ).length;
  const complete = percent === 100;
  const nextLesson = followingLesson(lesson.id);
  const firstUnread = lesson.steps.findIndex(
    (step) => !progress?.completedStepIds.includes(step.id),
  );
  const quizReady = lesson.quiz.every((question) => answers[question.id]);

  return (
    <div className="lesson-page page-container">
      <div className="lesson-breadcrumb">
        <button onClick={onBack}>
          <ArrowLeft size={14} /> К курсу
        </button>
        <ChevronRight size={12} />
        <span>{lesson.sectionTitle}</span>
      </div>
      <header className="lesson-header">
        <div className="lesson-heading-copy">
          <span className="eyebrow">
            ТЕМА {lesson.id} <span className="lesson-eyebrow-dot">·</span>{" "}
            УЧЕБНЫЙ МАТЕРИАЛ
          </span>
          <h1>{lesson.title}</h1>
          <p>{lesson.description}</p>
          <div className="lesson-meta">
            <span>
              <Clock3 size={13} />
              {lesson.durationMinutes} мин
            </span>
            <span>
              <BookOpen size={13} />
              {lesson.steps.length} шага
            </span>
            <span>
              <ListChecks size={13} />
              {lesson.quiz.length} вопроса
            </span>
            {complete && (
              <span className="lesson-meta-complete">
                <CheckCheck size={14} />
                Тема пройдена
              </span>
            )}
          </div>
        </div>
        <div
          className="lesson-progress-badge"
          aria-label={`Пройдено ${percent} процентов темы`}
        >
          <span>
            {percent}
            <small>%</small>
          </span>
          <span>прогресс темы</span>
        </div>
      </header>

      <div className="lesson-layout">
        <aside className="lesson-navigation" aria-label="Шаги темы">
          <div className="lesson-contents-label">В ЭТОЙ ТЕМЕ</div>
          <ol className="lesson-step-list">
            {lesson.steps.map((step, index) => {
              const read = progress?.completedStepIds.includes(step.id);
              return (
                <li key={step.id}>
                  <button
                    className={selected === index ? "is-current" : ""}
                    aria-current={selected === index ? "step" : undefined}
                    onClick={() => openStep(index)}
                    disabled={busy}
                  >
                    <span
                      className={`lesson-step-number${read ? " is-read" : ""}`}
                    >
                      {read ? (
                        <Check size={13} />
                      ) : (
                        String(index + 1).padStart(2, "0")
                      )}
                    </span>
                    <span>
                      {step.title}
                      {read && <small>Прочитано</small>}
                    </span>
                  </button>
                </li>
              );
            })}
            <li>
              <button
                className={quizView ? "is-current" : ""}
                aria-current={quizView ? "step" : undefined}
                onClick={() => openStep(lesson.steps.length)}
                disabled={busy}
              >
                <span
                  className={`lesson-step-number${progress?.quizPassed ? " is-read" : ""}`}
                >
                  {progress?.quizPassed ? (
                    <Check size={13} />
                  ) : (
                    <ListChecks size={14} />
                  )}
                </span>
                <span>
                  Проверка знаний
                  <small>
                    {progress?.bestScore !== null &&
                    progress?.bestScore !== undefined
                      ? `Лучший результат: ${progress.bestScore} из ${lesson.quiz.length}`
                      : "Тест по теме"}
                  </small>
                </span>
              </button>
            </li>
          </ol>
          <div className="lesson-save-status">
            <progress
              value={percent}
              max={100}
              aria-label="Прогресс изучения темы"
            />
            <div>
              {storage === "cloud" ? (
                <CloudCheck size={14} />
              ) : storage === "loading" ? (
                <LoaderCircle size={14} className="lesson-spinner" />
              ) : storage === "unavailable" ? (
                <TriangleAlert size={14} />
              ) : (
                <Monitor size={14} />
              )}
              <span>
                {storage === "cloud"
                  ? "Сохранено в аккаунте"
                  : storage === "loading"
                    ? "Загружаем прогресс…"
                    : storage === "unavailable"
                      ? "Только до обновления страницы"
                      : "Сохранено в этом браузере"}
              </span>
            </div>
            {storage === "local" && !storageError && (
              <button onClick={onSignIn}>
                Войти в аккаунт <ArrowRight size={12} />
              </button>
            )}
          </div>
          {materials.length > 0 && (
            <div className="lesson-materials">
              <div className="lesson-contents-label">МАТЕРИАЛЫ</div>
              {materials.map((material) => (
                <button
                  key={material.path}
                  onClick={() =>
                    material.type === "presentation"
                      ? onPreview(material)
                      : onDownload(material)
                  }
                >
                  {material.type === "presentation" ? (
                    <Presentation size={14} />
                  ) : (
                    <ArrowDownToLine size={14} />
                  )}
                  <span>
                    {material.type === "presentation"
                      ? "Открыть презентацию"
                      : "Конспект для учителя"}
                    <small>
                      {material.type === "presentation"
                        ? "Просмотр слайдов"
                        : "Документ · DOCX"}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </aside>

        <div className="lesson-reading-area">
          {storageError && (
            <div className="lesson-storage-warning" role="status">
              <TriangleAlert size={17} />
              <p>{storageError}</p>
            </div>
          )}
          {!quizView && activeStep ? (
            <article className="lesson-article">
              <div className="lesson-step-overline">
                <span>
                  ШАГ {String(selected + 1).padStart(2, "0")} /{" "}
                  {String(lesson.steps.length).padStart(2, "0")}
                </span>
                {progress?.completedStepIds.includes(activeStep.id) && (
                  <span className="lesson-read-label">
                    <Check size={12} />
                    Прочитано
                  </span>
                )}
              </div>
              <h2 ref={heading} tabIndex={-1}>
                {activeStep.title}
              </h2>
              {selected === 0 && (
                <div className="lesson-goals">
                  <div>
                    <Flag size={17} />
                    <h3>Цели темы</h3>
                  </div>
                  <ul>
                    {lesson.goals.map((goal) => (
                      <li key={goal}>{goal}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="lesson-prose">
                {activeStep.paragraphs.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
                {activeStep.bullets && (
                  <ul>
                    {activeStep.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                )}
              </div>
              {activeStep.code && (
                <div className="lesson-code-example">
                  <div>
                    <span className="lesson-code-dots" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                    <span>ПРИМЕР КОДА</span>
                  </div>
                  <pre>
                    <code>{activeStep.code}</code>
                  </pre>
                </div>
              )}
              {activeStep.callout && (
                <aside className="lesson-callout">
                  <Lightbulb size={20} />
                  <div>
                    <h3>{activeStep.callout.title}</h3>
                    <p>{activeStep.callout.text}</p>
                  </div>
                </aside>
              )}
              {actionError && (
                <p className="lesson-action-error" role="alert">
                  {actionError}
                </p>
              )}
              <div className="lesson-step-footer">
                <button
                  className="lesson-previous"
                  disabled={selected === 0 || busy}
                  onClick={() => openStep(selected - 1)}
                >
                  <ArrowLeft size={15} />
                  Назад
                </button>
                <button
                  className="primary-button"
                  onClick={readAndContinue}
                  disabled={busy || storage === "loading"}
                >
                  {busy ? (
                    <LoaderCircle className="lesson-spinner" size={16} />
                  ) : (
                    <Check size={16} />
                  )}
                  {selected === lesson.steps.length - 1
                    ? "Перейти к проверке"
                    : "Отметить и продолжить"}
                  <ArrowRight size={15} />
                </button>
              </div>
              <p className="lesson-read-note">
                Кнопка «
                {selected === lesson.steps.length - 1
                  ? "Перейти к проверке"
                  : "Отметить и продолжить"}
                » отмечает этот шаг как прочитанный.
              </p>
            </article>
          ) : (
            <article className="lesson-article lesson-quiz">
              <div className="lesson-step-overline">
                <span>ТЕСТ ПО ТЕМЕ</span>
              </div>
              <h2 ref={heading} tabIndex={-1}>
                Проверка знаний
              </h2>
              <p className="lesson-quiz-intro">
                Выберите один ответ в каждом вопросе. К теории можно вернуться в
                любой момент. Количество попыток не ограничено.
              </p>
              {readCount < lesson.steps.length && (
                <div className="lesson-quiz-reminder">
                  <CircleHelp size={18} />
                  <div>
                    <p>
                      Прочитано {readCount} из {lesson.steps.length} шагов. Для
                      завершения темы нужно изучить их все и пройти тест.
                    </p>
                    <button onClick={() => openStep(Math.max(0, firstUnread))}>
                      К непрочитанному шагу <ArrowRight size={13} />
                    </button>
                  </div>
                </div>
              )}
              <form onSubmit={checkAnswers}>
                {lesson.quiz.map((question, index) => {
                  const feedback = result?.feedback.find(
                    (item) => item.questionId === question.id,
                  );
                  return (
                    <fieldset
                      className="lesson-question"
                      key={question.id}
                      disabled={busy || Boolean(result)}
                    >
                      <legend>
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        {question.prompt}
                      </legend>
                      <div className="lesson-options">
                        {question.options.map((option) => (
                          <label
                            key={option.id}
                            className={
                              answers[question.id] === option.id
                                ? "is-selected"
                                : ""
                            }
                          >
                            <input
                              type="radio"
                              name={`lesson-${lesson.id}-${question.id}`}
                              value={option.id}
                              checked={answers[question.id] === option.id}
                              onChange={() =>
                                setAnswers((previous) => ({
                                  ...previous,
                                  [question.id]: option.id,
                                }))
                              }
                            />
                            <span>{option.text}</span>
                          </label>
                        ))}
                      </div>
                      {feedback && (
                        <div
                          className={`lesson-feedback${feedback.correct ? " is-correct" : ""}`}
                        >
                          {feedback.correct ? (
                            <Check size={16} />
                          ) : (
                            <Lightbulb size={16} />
                          )}
                          <p>
                            <strong>
                              {feedback.correct
                                ? "Верно. "
                                : "Ответ неверный. "}
                            </strong>
                            {feedback.explanation}
                          </p>
                        </div>
                      )}
                    </fieldset>
                  );
                })}
                {actionError && (
                  <p className="lesson-action-error" role="alert">
                    {actionError}
                  </p>
                )}
                {!result && (
                  <div className="lesson-check-row">
                    <span>
                      {Object.keys(answers).length} из {lesson.quiz.length}{" "}
                      ответов выбрано
                    </span>
                    <button
                      className="primary-button"
                      type="submit"
                      disabled={!quizReady || busy || storage === "loading"}
                    >
                      {busy ? (
                        <LoaderCircle className="lesson-spinner" size={15} />
                      ) : (
                        <CheckCheck size={16} />
                      )}
                      {busy ? "Проверяем…" : "Проверить ответы"}
                    </button>
                  </div>
                )}
              </form>
              {result && (
                <div
                  ref={resultBox}
                  tabIndex={-1}
                  className={`lesson-quiz-result${result.passed ? " is-passed" : ""}`}
                  role="status"
                >
                  <div className="lesson-result-score">
                    {result.score}
                    <span>/{result.total}</span>
                  </div>
                  <div>
                    <h3>
                      {result.passed
                        ? "Тест пройден"
                        : "Необходима повторная попытка"}
                    </h3>
                    <p>
                      {result.passed
                        ? complete
                          ? "Все шаги изучены, тест пройден. Тема завершена."
                          : "Тест пройден. Осталось отметить все шаги темы как прочитанные."
                        : "Изучите объяснения под ответами и повторите тест. Лучший результат сохраняется независимо от последующих попыток."}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setAnswers({});
                        setResult(null);
                        setActionError("");
                        requestAnimationFrame(() => heading.current?.focus());
                      }}
                    >
                      <RotateCcw size={13} />
                      Пройти ещё раз
                    </button>
                  </div>
                </div>
              )}
              {complete && (
                <div className="lesson-completion">
                  <span>
                    <CheckCheck size={18} />
                    Тема пройдена
                  </span>
                  {nextLesson ? (
                    <button
                      className="primary-button"
                      onClick={() => onNavigateLesson(nextLesson)}
                    >
                      Следующая тема <ArrowRight size={15} />
                    </button>
                  ) : (
                    <button className="primary-button" onClick={onBack}>
                      Вернуться к курсу <ArrowRight size={15} />
                    </button>
                  )}
                </div>
              )}
            </article>
          )}
          <section className="lesson-practice-card">
            <div className="lesson-practice-symbol">
              <Play size={20} />
            </div>
            <div>
              <span className="lesson-contents-label">
                ПРАКТИЧЕСКОЕ ЗАДАНИЕ
              </span>
              <h3>{lesson.practice.title}</h3>
              <ul>
                {lesson.practice.instructions.map((instruction) => (
                  <li key={instruction}>{instruction}</li>
                ))}
              </ul>
              {lesson.practice.availableInSimulator ? (
                <button onClick={onPractice}>
                  Открыть практическую среду <ArrowRight size={14} />
                </button>
              ) : (
                <p className="lesson-practice-note">
                  Самостоятельное задание для выполнения на бумаге или
                  обсуждения с учителем. Эта сцена пока недоступна в симуляторе.
                </p>
              )}
            </div>
          </section>
          <p className="lesson-source">
            <BookOpen size={12} />
            <span>
              {lesson.source.label}
              {lesson.source.kind === "new"
                ? " · Новый учебный материал"
                : " · Адаптировано для платформы"}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
