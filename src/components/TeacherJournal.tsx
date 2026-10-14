import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { api, supabase } from "../lib/api";
import { t, getLanguageTag, useLanguage } from "../lib/i18n";
import { lessonCopies } from "../../shared/lesson-localization";
import type { CustomSection, Profile, Task } from "../lib/types";
import type {
  AttemptSummary,
  ReviewAttempt,
  SectionGrade,
  StudentReport,
} from "../../shared/review";
import { evaluateCode } from "../../shared/simulator";
import {
  courseTaskById,
  courseTaskByLesson,
  courseElectronics,
  evaluateCourseTask,
} from "../../shared/course-practice";
import {
  EXERCISES,
  PARTS,
  type Exercise,
  type Circuit,
} from "../../shared/electronics";
import { Board } from "./Practice";
import "./teacher-journal.css";

const BlockEditor = lazy(() => import("./BlockEditor"));
const date = (value: string) =>
  new Date(value).toLocaleString(getLanguageTag());
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "Не удалось загрузить журнал.";

export function TeacherJournal({
  classId,
  ownerId,
  sections,
  tasks,
}: {
  classId: string;
  ownerId: string;
  sections: CustomSection[];
  tasks: Task[];
}) {
  const [students, setStudents] = useState<Profile[]>([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setStudents([]);
    api<{ students: Profile[] }>(
      `/classes/${classId}/students`,
      undefined,
      supabase ? { expectedUserId: ownerId } : undefined,
    )
      .then((data) => {
        if (active) {
          setStudents(data.students);
          setSelected((old) =>
            data.students.some((s) => s.id === old)
              ? old
              : data.students[0]?.id || "",
          );
        }
      })
      .catch((error) => {
        if (active) setError(errorText(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [classId, ownerId, revision]);
  return (
    <section className="teacher-journal">
      <div className="section-heading">
        <h2>{t("Прогресс и оценки")}</h2>
        <button
          className="text-button"
          onClick={() => setRevision((v) => v + 1)}
        >
          {t("Обновить журнал")}
        </button>
      </div>
      <p className="journal-note">
        {t(
          "Виден облачный прогресс участников этого класса. Черновики и работа без отправки учителю не видны.",
        )}
      </p>
      {loading ? (
        <p role="status">{t("Загрузка журнала…")}</p>
      ) : error ? (
        <p role="alert">{t(error)}</p>
      ) : !students.length ? (
        <p className="empty-state">
          {t("В классе пока нет учеников. Отправьте им код приглашения.")}
        </p>
      ) : (
        <>
          <label className="journal-student">
            {t("Ученик")}
            <select
              aria-label={t("Ученик")}
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
            >
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name} · {student.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          <StudentJournal
            key={`${classId}:${selected}:${revision}`}
            classId={classId}
            studentId={selected}
            ownerId={ownerId}
            sections={sections}
            tasks={tasks}
          />
        </>
      )}
    </section>
  );
}

function StudentJournal({
  classId,
  studentId,
  ownerId,
  sections,
  tasks,
}: {
  classId: string;
  studentId: string;
  ownerId: string;
  sections: CustomSection[];
  tasks: Task[];
}) {
  const language = useLanguage();
  const base = `/classes/${classId}/students/${studentId}`;
  const [report, setReport] = useState<StudentReport>();
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [sectionKey, setSectionKey] = useState("course:1");
  const [attempt, setAttempt] = useState<ReviewAttempt>();
  const [attemptError, setAttemptError] = useState("");
  const [attemptLoading, setAttemptLoading] = useState(false);
  const [visible, setVisible] = useState(20);
  const requestId = useRef(0);
  useEffect(() => {
    let active = true;
    setReport(undefined);
    setError("");
    api<StudentReport>(`${base}/progress`)
      .then((data) => {
        if (active) setReport(data);
      })
      .catch((error) => {
        if (active) setError(errorText(error));
      });
    return () => {
      active = false;
      requestId.current++;
    };
  }, [base, revision]);
  async function openAttempt(summary: AttemptSummary) {
    const id = ++requestId.current;
    setAttempt(undefined);
    setAttemptError("");
    setAttemptLoading(true);
    try {
      const data = await api<{ attempt: ReviewAttempt }>(
        `${base}/attempts/${summary.id}?kind=${summary.kind}`,
      );
      if (requestId.current === id) setAttempt(data.attempt);
    } catch (error) {
      if (requestId.current === id) setAttemptError(errorText(error));
    } finally {
      if (requestId.current === id) setAttemptLoading(false);
    }
  }
  if (error)
    return (
      <div role="alert">
        <p>{t(error)}</p>
        <button
          className="text-button"
          onClick={() => setRevision((v) => v + 1)}
        >
          {t("Повторить")}
        </button>
      </div>
    );
  if (!report) return <p role="status">{t("Загрузка журнала…")}</p>;
  const courseSections = [
    ...new Map(
      report.lessons.map((l) => [l.sectionNumber, l.sectionTitle]),
    ).entries(),
  ];
  const lessonIds = report.lessons
    .filter((l) => `course:${l.sectionNumber}` === sectionKey)
    .map((l) => l.id);
  const selectedTasks = tasks.filter(
    (task) => `custom:${task.section_id}` === sectionKey,
  );
  const belongsToLesson = (attempt: AttemptSummary, lessonId: string) =>
    attempt.lesson_id === lessonId &&
    (attempt.kind === "robot"
      ? attempt.task_id === courseTaskByLesson(lessonId)?.id
      : attempt.task_id === courseElectronics[lessonId]?.exercise);
  const selectedAttempts = report.attempts.filter(
    (a) =>
      lessonIds.some((id) => belongsToLesson(a, id)) ||
      selectedTasks.some((task) => task.id === a.task_id),
  );
  const practiceStatus = (attempts: AttemptSummary[]) =>
    t(
      attempts.some((a) => a.success)
        ? "Есть успешная попытка"
        : attempts.length
          ? "Отправлено, нужна доработка"
          : "Не отправлено",
    );
  const title = (a: AttemptSummary) =>
    a.kind === "electronics"
      ? t(EXERCISES[a.task_id as Exercise]?.title || a.task_id)
      : tasks.find((task) => task.id === a.task_id)?.title ||
        (courseTaskById(a.task_id)
          ? t(courseTaskById(a.task_id)!.title)
          : a.task_id === "intro-route"
            ? t("Доставка на Марс")
            : a.task_id);
  return (
    <>
      <div className="journal-summary">
        <span>
          {t("Завершённые темы")}:{" "}
          {report.progress.filter((p) => p.completedAt).length} /{" "}
          {report.lessons.length}
        </span>
        <span>
          {t("Отправленные попытки")}: {report.attempts.length}
        </span>
        <span>
          {t("Успешные попытки")}:{" "}
          {report.attempts.filter((a) => a.success).length}
        </span>
      </div>
      <p className="journal-note">
        {t(
          "Процент показывает теорию и проверку знаний. Результаты практики учитываются отдельно.",
        )}
      </p>
      <label className="journal-student">
        {t("Раздел для просмотра и оценки")}
        <select
          aria-label={t("Раздел для просмотра и оценки")}
          value={sectionKey}
          onChange={(event) => setSectionKey(event.target.value)}
        >
          {courseSections.map(([number, name]) => (
            <option key={number} value={`course:${number}`}>
              {number}. {t(name)}
            </option>
          ))}
          {sections.map((section) => (
            <option key={section.id} value={`custom:${section.id}`}>
              {t("Урок учителя")}: {section.title}
            </option>
          ))}
        </select>
      </label>
      {report.lessons
        .filter((l) => lessonIds.includes(l.id))
        .map((lesson) => {
          const progress = report.progress.find(
            (p) => p.lessonId === lesson.id,
          );
          const read = lesson.stepIds.filter((id) =>
            progress?.completedStepIds.includes(id),
          ).length;
          const percent = Math.round(
            ((read + Number(Boolean(progress?.quizPassed))) /
              (lesson.stepIds.length + 1)) *
              100,
          );
          return (
            <article className="journal-lesson" key={lesson.id}>
              <h3>
                {lesson.id}. {t(lesson.title)}
              </h3>
              <progress
                max={100}
                value={percent}
                aria-label={`${lesson.id}: ${percent}%`}
              />{" "}
              <span>{percent}%</span>
              <p>
                {t("Шаги теории")}: {read}/{lesson.stepIds.length} ·{" "}
                {t("Проверка знаний")}: {progress?.bestScore ?? "—"}/
                {lesson.quizTotal}
              </p>
              <details>
                <summary>{t("Этапы изучения темы")}</summary>
                <ol>
                  {lesson.stepIds.map((id, index) => (
                    <li key={id}>
                      {language === "ru"
                        ? lesson.stepTitles[index]
                        : lessonCopies[language][lesson.id]?.steps[
                            index
                          ]?.[0] || lesson.stepTitles[index]}
                      :{" "}
                      {t(
                        progress?.completedStepIds.includes(id)
                          ? "Прочитано"
                          : "Не отмечено",
                      )}
                    </li>
                  ))}
                  <li>
                    {t("Проверка знаний")}:{" "}
                    {t(progress?.quizPassed ? "Пройдено" : "Не пройдено")}
                  </li>
                </ol>
              </details>
              <p>
                {t("Практика")}:{" "}
                {practiceStatus(
                  report.attempts.filter((a) => belongsToLesson(a, lesson.id)),
                )}
              </p>
              <p>
                {t(
                  progress?.completedAt
                    ? "Тема завершена"
                    : read || progress?.bestScore != null
                      ? "В процессе"
                      : "Не начато",
                )}
                {progress && ` · ${date(progress.updatedAt)}`}
              </p>
            </article>
          );
        })}
      {sectionKey.startsWith("custom:") && (
        <div className="journal-lesson">
          <p>
            {t(
              "Для уроков учителя учитываются отправленные задания. Чтение текста пока не отслеживается.",
            )}
          </p>
          {selectedTasks.length ? (
            selectedTasks.map((task) => (
              <p key={task.id}>
                {task.title}:{" "}
                {practiceStatus(
                  report.attempts.filter((a) => a.task_id === task.id),
                )}
              </p>
            ))
          ) : (
            <p>{t("К этому уроку пока нет практических заданий.")}</p>
          )}
        </div>
      )}
      <p className="journal-note">
        {t(
          "Каждая тема имеет своё задание. Общие тренировки и старые попытки показаны в истории, но не засчитываются за новые задания курса.",
        )}
      </p>
      <p>
        {t("Практика выбранного раздела")}: {practiceStatus(selectedAttempts)}
        {sectionKey.startsWith("course:") && (
          <>
            {" "}
            ·{" "}
            {t(
              `Выполнено заданий: ${lessonIds.filter((id) => selectedAttempts.some((a) => belongsToLesson(a, id) && a.success)).length} из ${lessonIds.length}`,
            )}
          </>
        )}
      </p>
      <GradeForm
        key={sectionKey}
        base={base}
        ownerId={ownerId}
        sectionKey={sectionKey}
        grade={report.grades.find((g) => g.section_key === sectionKey)}
        onSaved={(grade) =>
          setReport(
            (old) =>
              old && {
                ...old,
                grades: [
                  ...old.grades.filter(
                    (g) => g.section_key !== grade.section_key,
                  ),
                  grade,
                ],
              },
          )
        }
      />
      <h3>{t("История решений")}</h3>
      <p className="journal-note">
        {t(
          "Все отправленные решения курса и этого класса, включая неуспешные. Решения других классов скрыты.",
        )}
      </p>
      {report.attempts.length ? (
        <div className="journal-attempts">
          {report.attempts.slice(0, visible).map((summary) => (
            <button
              className="journal-attempt"
              key={`${summary.kind}:${summary.id}`}
              onClick={() => void openAttempt(summary)}
            >
              <span>
                {title(summary)}{" "}
                {summary.lesson_id && ` · ${summary.lesson_id}`}
              </span>
              <span>
                {t(summary.success ? "Выполнено" : "Нужна доработка")} ·{" "}
                {date(summary.created_at)}
              </span>
              <span>{t("Посмотреть решение")}</span>
            </button>
          ))}
        </div>
      ) : (
        <p>{t("Не отправлено")}</p>
      )}
      {visible < report.attempts.length && (
        <button
          className="text-button"
          onClick={() => setVisible((v) => v + 20)}
        >
          {t("Показать ещё")}
        </button>
      )}
      {attemptLoading && <p role="status">{t("Загрузка решения…")}</p>}
      {attemptError && <p role="alert">{t(attemptError)}</p>}
      {attempt && <AttemptViewer key={attempt.id} attempt={attempt} />}
    </>
  );
}

function GradeForm({
  base,
  ownerId,
  sectionKey,
  grade,
  onSaved,
}: {
  base: string;
  ownerId: string;
  sectionKey: string;
  grade?: SectionGrade;
  onSaved: (grade: SectionGrade) => void;
}) {
  const [score, setScore] = useState(grade ? String(grade.score) : "");
  const [comment, setComment] = useState(grade?.comment || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy || score === "") return;
    setBusy(true);
    setMessage("");
    try {
      const data = await api<{ grade: SectionGrade }>(
        `${base}/grades`,
        { sectionKey, score: Number(score), comment },
        supabase ? { expectedUserId: ownerId } : undefined,
      );
      if (active.current) {
        onSaved(data.grade);
        setMessage("Оценка сохранена.");
      }
    } catch (error) {
      if (active.current) setMessage(errorText(error));
    } finally {
      if (active.current) setBusy(false);
    }
  }
  return (
    <form className="stack-form journal-grade" onSubmit={save}>
      <h3>{t("Оценка за раздел")}</h3>
      <p>
        {t(
          "Оценка выставляется учителем вручную, независимо от автоматической проверки.",
        )}
      </p>
      <label>
        {t("Баллы (0–10)")}
        <input
          type="number"
          min={0}
          max={10}
          step={1}
          required
          value={score}
          disabled={busy}
          onChange={(event) => setScore(event.target.value)}
        />
      </label>
      <label>
        {t("Комментарий учителя")}
        <textarea
          maxLength={2000}
          rows={3}
          value={comment}
          disabled={busy}
          onChange={(event) => setComment(event.target.value)}
        />
      </label>
      {grade && (
        <p>
          {t("Последняя оценка")}: {grade.score}/10 · {date(grade.updated_at)}
        </p>
      )}
      <button className="primary-button" disabled={busy || score === ""}>
        {t(busy ? "Сохраняем…" : "Сохранить оценку")}
      </button>
      {message && <p role="status">{t(message)}</p>}
    </form>
  );
}

function AttemptViewer({ attempt }: { attempt: ReviewAttempt }) {
  const [step, setStep] = useState(0);
  const [mapIndex, setMapIndex] = useState(0);
  const course = attempt.task_snapshot?.courseTask;
  const world =
    mapIndex && course
      ? course.variants[mapIndex - 1]
      : attempt.task_snapshot?.world;
  const result = useMemo(
    () =>
      attempt.task_snapshot
        ? course
          ? evaluateCourseTask(attempt.code, course, mapIndex)
          : evaluateCode(attempt.code, attempt.task_snapshot.world)
        : null,
    [attempt, course, mapIndex],
  );
  return (
    <section className="journal-solution">
      <h3>{t("Отправленное решение")}</h3>
      <p>
        {date(attempt.created_at)} ·{" "}
        {t(attempt.success ? "Выполнено" : "Нужна доработка")}
      </p>
      {attempt.task_snapshot && (
        <>
          <h4>{attempt.task_snapshot.title}</h4>
          <p>{attempt.task_snapshot.description}</p>
        </>
      )}
      <p>{t(attempt.feedback)}</p>
      {result && "checks" in result && (
        <ul>
          {(
            result.checks as import("../../shared/course-practice").PracticeCheck[]
          ).map((check) => (
            <li key={check.label}>
              {t(check.passed ? "Пройдено" : "Не выполнено")} · {t(check.label)}
            </li>
          ))}
        </ul>
      )}
      {!!course?.variants.length && (
        <label>
          {t("Карта для просмотра")}
          <select
            value={mapIndex}
            aria-label={t("Карта для просмотра")}
            onChange={(event) => {
              setMapIndex(Number(event.target.value));
              setStep(0);
            }}
          >
            {[course.world, ...course.variants].map((_, index) => (
              <option key={index} value={index}>
                {t(`Карта ${index + 1}`)}
              </option>
            ))}
          </select>
        </label>
      )}
      {attempt.blocks_state ? (
        <Suspense fallback={<p>{t("Загружаем блоки…")}</p>}>
          <BlockEditor
            readOnly
            variant={attempt.kind === "electronics" ? "electronics" : "robot"}
            initialState={attempt.blocks_state}
            onChange={() => {}}
          />
        </Suspense>
      ) : (
        <p>
          {t(
            "Блоки не сохранены: решение отправлено текстом или до обновления платформы.",
          )}
        </p>
      )}
      <h4>{t("Код решения")}</h4>
      <pre className="journal-code">
        <code>{attempt.code}</code>
      </pre>
      {result && attempt.task_snapshot && (
        <>
          <h4>{t("Выполнение по шагам")}</h4>
          <Board
            world={world!}
            frame={result.frames[step]}
            frames={result.frames.slice(0, step + 1)}
          />
          <label>
            {t("Шаг")}: {step}/{result.frames.length - 1}
            <input
              type="range"
              min={0}
              max={result.frames.length - 1}
              value={step}
              onChange={(event) => setStep(Number(event.target.value))}
            />
          </label>
          <p>
            <code>{result.frames[step]?.command}</code>
          </p>
        </>
      )}
      {attempt.kind === "robot" && !attempt.task_snapshot && (
        <p>
          {t(
            "Для старой попытки карта не сохранена. Доступны исходный код и результат проверки.",
          )}
        </p>
      )}
      {attempt.circuit && (
        <>
          <h4>{t("Сохранённая схема")}</h4>
          <CircuitSnapshot circuit={attempt.circuit} />
          <ul>
            {attempt.circuit.parts.map((part) => (
              <li key={part.kind}>
                {t(PARTS[part.kind].title)} · x: {part.x}, y: {part.y}
              </li>
            ))}
          </ul>
          <table>
            <thead>
              <tr>
                <th>{t("От контакта")}</th>
                <th>{t("К контакту")}</th>
              </tr>
            </thead>
            <tbody>
              {attempt.circuit.wires.map((wire, i) => (
                <tr key={i}>
                  <td>{wire.from}</td>
                  <td>{wire.to}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

function CircuitSnapshot({ circuit }: { circuit: Circuit }) {
  const pin = (id: string) => {
    const [kind, name] = id.split(".");
    const part = circuit.parts.find((p) => p.kind === kind)!;
    const pins: readonly string[] = PARTS[part.kind].pins;
    return {
      x: part.x + ((pins.indexOf(name) + 1) * 170) / (pins.length + 1),
      y: part.y + 156,
    };
  };
  return (
    <svg
      className="journal-circuit"
      viewBox="0 0 820 560"
      role="img"
      aria-label={t("Сохранённая схема")}
    >
      {circuit.wires.map((wire, i) => {
        const a = pin(wire.from),
          b = pin(wire.to);
        return (
          <path
            key={i}
            d={`M ${a.x} ${a.y} V ${Math.max(a.y, b.y) + 25 + i * 3} H ${b.x} V ${b.y}`}
            fill="none"
            stroke={
              wire.from.includes("GND") || wire.to.includes("GND")
                ? "#a8b8ca"
                : "#5297ff"
            }
            strokeWidth={3}
          />
        );
      })}
      {circuit.parts.map((part) => (
        <g key={part.kind}>
          <rect
            x={part.x}
            y={part.y}
            width={170}
            height={156}
            rx={10}
            fill="#172b40"
            stroke="#517b9f"
          />
          <text x={part.x + 10} y={part.y + 40} fill="#e8f1ff" fontSize={13}>
            {t(PARTS[part.kind].title)}
          </text>
          {PARTS[part.kind].pins.map((name) => {
            const pos = pin(`${part.kind}.${name}`);
            return (
              <g key={name}>
                <circle cx={pos.x} cy={pos.y} r={5} fill="#91baff" />
                <text
                  x={pos.x}
                  y={pos.y - 16}
                  textAnchor="middle"
                  fill="#c5d8eb"
                  fontSize={12}
                >
                  {name}
                </text>
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}

export function StudentGrades({
  classId,
  sections,
}: {
  classId: string;
  sections: CustomSection[];
}) {
  const [grades, setGrades] = useState<SectionGrade[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setGrades([]);
    setError("");
    setLoading(true);
    api<{ grades: SectionGrade[] }>(`/classes/${classId}/my-grades`)
      .then((data) => {
        if (active) setGrades(data.grades);
      })
      .catch((error) => {
        if (active) setError(errorText(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [classId, revision]);
  return (
    <section className="journal-grades">
      <h2>{t("Мои оценки")}</h2>
      {loading ? (
        <p role="status">{t("Загрузка журнала…")}</p>
      ) : error ? (
        <div role="alert">
          <p>{t(error)}</p>
          <button
            className="text-button"
            onClick={() => setRevision((v) => v + 1)}
          >
            {t("Повторить")}
          </button>
        </div>
      ) : grades.length ? (
        grades.map((grade) => (
          <article className="journal-lesson" key={grade.section_key}>
            <h3>
              {grade.section_key.startsWith("course:")
                ? `${t("Раздел курса")} ${grade.section_key.slice(7)}`
                : sections.find((s) => `custom:${s.id}` === grade.section_key)
                    ?.title || t("Урок учителя")}
              : {grade.score}/10
            </h3>
            <p>{grade.comment}</p>
            <small>{date(grade.updated_at)}</small>
          </article>
        ))
      ) : (
        <p>{t("Учитель пока не выставил оценки.")}</p>
      )}
    </section>
  );
}
