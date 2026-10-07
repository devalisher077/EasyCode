import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  Copy,
  Layers3,
  Plus,
  Users,
  X,
} from "lucide-react";
import { api, downloadMaterial } from "../lib/api";
import { useDialog } from "../lib/useDialog";
import type {
  Classroom as ClassType,
  CustomSection,
  Role,
  Submission,
  Task,
} from "../lib/types";
import { DEFAULT_WORLD } from "../../shared/simulator";
import "./classroom.css";
type Form = "class" | "section" | "task" | "join" | null;
export function Classroom({
  role,
  onNotice,
  onPractice,
}: {
  role: Role;
  onNotice: (message: string) => void;
  onPractice: (task: Task) => void;
}) {
  const [classes, setClasses] = useState<ClassType[]>([]);
  const [selected, setSelected] = useState("");
  const [sections, setSections] = useState<CustomSection[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [form, setForm] = useState<Form>(null);
  const [taskLessonId, setTaskLessonId] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState("");
  const scope = useRef(0);
  const classRequest = useRef(0);
  const contentRequest = useRef(0);
  const activeClass = useRef(selected);
  activeClass.current = selected;
  const teacher = role === "teacher";
  useDialog(Boolean(form), () => {
    if (!busy) setForm(null);
  });
  const current = classes.find((c) => c.id === selected);
  async function loadClasses(preferredId?: string) {
    const request = ++classRequest.current;
    const owner = scope.current;
    const isCurrent = () =>
      owner === scope.current && request === classRequest.current;
    setLoading(true);
    setError("");
    try {
      const data = await api<{ classes: ClassType[] }>("/classes");
      if (!isCurrent()) return;
      setClasses(data.classes);
      setSelected((old) => {
        const target = preferredId || old;
        return data.classes.some((c) => c.id === target)
          ? target
          : data.classes[0]?.id || "";
      });
    } catch (e) {
      if (isCurrent())
        setError(
          e instanceof Error ? e.message : "Не удалось загрузить классы",
        );
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }
  async function loadContent(classId = selected) {
    const request = ++contentRequest.current;
    const owner = scope.current;
    const isCurrent = () =>
      owner === scope.current &&
      request === contentRequest.current &&
      activeClass.current === classId;
    setSections([]);
    setTasks([]);
    setSubmissions([]);
    setContentError("");
    setContentLoading(Boolean(classId));
    if (!classId) return;
    const query = encodeURIComponent(classId);
    try {
      const [s, t, r] = await Promise.all([
        api<{ sections: CustomSection[] }>(`/sections?classId=${query}`),
        api<{ tasks: Task[] }>(`/tasks?classId=${query}`),
        api<{ submissions: Submission[] }>(`/submissions?classId=${query}`),
      ]);
      if (!isCurrent()) return;
      setSections(s.sections.filter((section) => section.class_id === classId));
      setTasks(t.tasks.filter((task) => task.class_id === classId));
      setSubmissions(r.submissions);
    } catch (e) {
      if (isCurrent())
        setContentError(
          e instanceof Error ? e.message : "Не удалось загрузить уроки",
        );
    } finally {
      if (isCurrent()) setContentLoading(false);
    }
  }
  useEffect(() => {
    scope.current += 1;
    setClasses([]);
    setSelected("");
    setForm(null);
    setBusy(false);
    void loadClasses();
    return () => {
      scope.current += 1;
      classRequest.current += 1;
      contentRequest.current += 1;
    };
  }, [role]);
  useEffect(() => {
    void loadContent();
  }, [selected]);
  function openTask(lessonId = "") {
    setTaskLessonId(lessonId);
    setForm("task");
  }
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !form || (form !== "join" && !teacher)) return;
    setBusy(true);
    const owner = scope.current;
    const d = new FormData(e.currentTarget);
    try {
      if (form === "class") {
        const data = await api<{ class: ClassType }>("/classes", {
          name: d.get("title"),
        });
        if (owner !== scope.current) return;
        setForm(null);
        onNotice("Класс создан. Код приглашения можно отправить ученикам.");
        await loadClasses(data.class.id);
      }
      if (form === "join") {
        const data = await api<{ class: ClassType }>("/classes/join", {
          code: String(d.get("code")).trim().toUpperCase(),
        });
        if (owner !== scope.current) return;
        setForm(null);
        onNotice("Вы присоединились к классу.");
        await loadClasses(data.class.id);
      }
      if (form === "section") {
        await api("/sections", {
          classId: selected,
          title: d.get("title"),
          theory: d.get("theory"),
        });
        if (owner !== scope.current) return;
        setForm(null);
        onNotice(
          "Урок создан и доступен ученикам этого класса. Теперь можно добавить задание.",
        );
        await loadContent();
      }
      if (form === "task") {
        await api("/tasks", {
          classId: selected,
          sectionId: d.get("sectionId") || undefined,
          title: d.get("title"),
          description: d.get("description"),
          difficulty: d.get("difficulty"),
          world: DEFAULT_WORLD,
        });
        if (owner !== scope.current) return;
        setForm(null);
        onNotice("Задание добавлено в класс.");
        await loadContent();
      }
    } catch (e) {
      if (owner === scope.current)
        onNotice(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      if (owner === scope.current) setBusy(false);
    }
  }
  return (
    <div className="classroom-page page-container">
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {teacher ? "УПРАВЛЕНИЕ ОБУЧЕНИЕМ" : "УЧЕБНОЕ ПРОСТРАНСТВО"}
          </span>
          <h1>{teacher ? "Кабинет учителя" : "Мой класс"}</h1>
          <p>
            {teacher
              ? "Создание классов, публикация уроков и просмотр результатов учеников. Доступ к классу — по коду приглашения."
              : "Учебные материалы, задания и результаты вашего класса. Для присоединения нужен код учителя."}
          </p>
          {teacher && (
            <button
              className="text-button plan-download"
              onClick={() =>
                downloadMaterial("course-plan/План разделов.docx").catch((e) =>
                  onNotice(e.message),
                )
              }
            >
              <BookOpen size={14} />
              Скачать исходный план курса
            </button>
          )}
        </div>
        <button
          className="primary-button"
          onClick={() => setForm(teacher ? "class" : "join")}
        >
          <Plus size={17} />
          {teacher ? "Создать класс" : "Присоединиться"}
        </button>
      </div>
      {error && (
        <div className="empty-state">
          {error}
          <button
            className="text-button"
            style={{ marginLeft: 12 }}
            onClick={() => void loadClasses()}
          >
            Повторить
          </button>
        </div>
      )}
      {loading ? (
        <div className="empty-state">Загружаем классы…</div>
      ) : !classes.length && !error ? (
        <div className="large-empty">
          <span>
            <Users size={36} />
          </span>
          <h2>
            {teacher
              ? "Классы пока не созданы"
              : "Вы пока не присоединились к классу"}
          </h2>
          <p>
            {teacher
              ? "Создайте класс и отправьте ученикам код приглашения."
              : "Введите код приглашения, полученный от учителя."}
          </p>
          <button
            className="primary-button classroom-empty-action"
            onClick={() => setForm(teacher ? "class" : "join")}
          >
            <Plus size={16} />
            {teacher ? "Создать первый класс" : "Ввести код учителя"}
          </button>
        </div>
      ) : classes.length ? (
        <>
          <div className="class-tabs">
            {classes.map((c) => (
              <button
                className={selected === c.id ? "selected" : ""}
                key={c.id}
                onClick={() => setSelected(c.id)}
                aria-pressed={selected === c.id}
                disabled={busy}
              >
                <Users size={16} />
                {c.name}
              </button>
            ))}
          </div>
          <div className="class-overview">
            <div>
              <span className="eyebrow">ВЫБРАННЫЙ КЛАСС</span>
              <h2>{current?.name}</h2>
              <p>
                {contentLoading
                  ? "Загружаем уроки…"
                  : contentError
                    ? "Материалы временно недоступны"
                    : `Уроков: ${sections.length} · заданий: ${tasks.length}`}
                {teacher ? ` · ${current?.member_count ?? 0} учеников` : ""}
              </p>
            </div>
            {teacher && (
              <div className="invite-code">
                <span>Код приглашения</span>
                <button
                  title="Скопировать код"
                  onClick={() =>
                    navigator.clipboard
                      .writeText(current?.join_code || "")
                      .then(() => onNotice("Код скопирован"))
                      .catch(() =>
                        onNotice(`Код класса: ${current?.join_code}`),
                      )
                  }
                >
                  {current?.join_code}
                  <Copy size={17} />
                </button>
              </div>
            )}
          </div>
          <div className="section-heading">
            <h2>Уроки и практика</h2>
            {teacher && (
              <div className="button-row">
                <button
                  className="secondary-button"
                  onClick={() => setForm("section")}
                  disabled={busy || contentLoading || !current}
                >
                  <BookOpen size={15} />
                  Новый урок
                </button>
                <button
                  className="primary-button"
                  onClick={() => openTask()}
                  disabled={
                    busy || contentLoading || Boolean(contentError) || !current
                  }
                >
                  <Plus size={16} />
                  Новое задание
                </button>
              </div>
            )}
          </div>
          {contentLoading ? (
            <div className="empty-state" role="status">
              Загружаем уроки и задания…
            </div>
          ) : contentError ? (
            <div className="empty-state classroom-content-error" role="alert">
              <p>{contentError}</p>
              <button
                className="text-button"
                onClick={() => void loadContent()}
              >
                Повторить загрузку
              </button>
            </div>
          ) : (
            <>
              <div className="class-content-grid">
                <section>
                  <h3 className="column-heading">
                    <BookOpen size={16} />
                    Уроки с теорией
                  </h3>
                  {sections.length ? (
                    sections.map((section) => (
                      <article className="custom-section" key={section.id}>
                        <span className="course-icon">
                          <Layers3 size={20} />
                        </span>
                        <h3>{section.title}</h3>
                        <p>{section.theory}</p>
                        {tasks.some(
                          (task) => task.section_id === section.id,
                        ) && (
                          <div className="lesson-linked-tasks">
                            <span>Практика к уроку</span>
                            {tasks
                              .filter((task) => task.section_id === section.id)
                              .map((task) => (
                                <button
                                  className="text-button"
                                  key={task.id}
                                  onClick={() => onPractice(task)}
                                >
                                  {task.title}
                                  <ArrowRight size={14} />
                                </button>
                              ))}
                          </div>
                        )}
                        {teacher && (
                          <button
                            className="text-button classroom-lesson-action"
                            onClick={() => openTask(section.id)}
                            disabled={busy}
                          >
                            <Plus size={14} /> Добавить задание к уроку
                          </button>
                        )}
                      </article>
                    ))
                  ) : (
                    <div className="empty-state">
                      <p>
                        {teacher
                          ? "Добавьте урок с названием, объяснением темы и примерами. Он будет доступен ученикам класса."
                          : "Учитель пока не добавил уроки."}
                      </p>
                      {teacher && (
                        <button
                          className="text-button classroom-empty-action"
                          onClick={() => setForm("section")}
                        >
                          Создать первый урок <ArrowRight size={14} />
                        </button>
                      )}
                    </div>
                  )}
                </section>
                <section>
                  <h3 className="column-heading">
                    <Check size={16} />
                    Задания
                  </h3>
                  {tasks.length ? (
                    tasks.map((task) => (
                      <article className="assignment-card" key={task.id}>
                        {task.section_id && (
                          <span className="assignment-lesson">
                            Урок:{" "}
                            {sections.find(
                              (section) => section.id === task.section_id,
                            )?.title || "Урок класса"}
                          </span>
                        )}
                        <span className="difficulty">
                          {task.difficulty === "easy"
                            ? "Начальный"
                            : task.difficulty === "medium"
                              ? "Средний"
                              : "Продвинутый"}
                        </span>
                        <h3>{task.title}</h3>
                        <p>{task.description}</p>
                        <button
                          className="text-button"
                          onClick={() => onPractice(task)}
                        >
                          {teacher ? "Открыть задание" : "Решить задание"}
                          <ArrowRight size={16} />
                        </button>
                      </article>
                    ))
                  ) : (
                    <div className="empty-state">
                      <p>
                        {teacher
                          ? "Добавьте практическое задание для выполнения в симуляторе."
                          : "Новые задания скоро появятся здесь."}
                      </p>
                      {teacher && (
                        <button
                          className="text-button classroom-empty-action"
                          onClick={() => openTask()}
                        >
                          Создать задание <ArrowRight size={14} />
                        </button>
                      )}
                    </div>
                  )}
                </section>
              </div>
              <section className="results-section">
                <div className="section-heading">
                  <h2>{teacher ? "Решения учеников" : "Мои результаты"}</h2>
                  <button
                    className="text-button"
                    onClick={() => void loadContent()}
                  >
                    Обновить
                  </button>
                </div>
                {submissions.length ? (
                  <div className="results-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Задание</th>
                          {teacher && <th>Ученик</th>}
                          <th>Результат</th>
                          <th>Когда</th>
                        </tr>
                      </thead>
                      <tbody>
                        {submissions.map((s) => (
                          <tr key={s.id}>
                            <td>
                              {tasks.find((t) => t.id === s.task_id)?.title ||
                                "Тренировочный маршрут"}
                            </td>
                            {teacher && (
                              <td title={s.student_id}>
                                {s.student_id.slice(0, 8)}
                              </td>
                            )}
                            <td>
                              <span
                                className={
                                  s.success || s.result?.success
                                    ? "success-text"
                                    : "muted"
                                }
                              >
                                {s.success || s.result?.success
                                  ? "Выполнено"
                                  : "Нужна доработка"}
                              </span>
                            </td>
                            <td>
                              {new Date(s.created_at).toLocaleString("ru-RU", {
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty-state">
                    Проверенные решения появятся здесь.
                  </div>
                )}
              </section>
            </>
          )}
        </>
      ) : null}
      {form && (
        <div className="modal-overlay" onClick={() => !busy && setForm(null)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="classroom-form-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="icon-button modal-close"
              aria-label="Закрыть"
              onClick={() => setForm(null)}
              disabled={busy}
            >
              <X size={20} />
            </button>
            <span className="eyebrow">
              {form === "join" ? "ДОСТУП К КЛАССУ" : "СОЗДАНИЕ МАТЕРИАЛОВ"}
            </span>
            <h2 id="classroom-form-title">
              {form === "class"
                ? "Новый класс"
                : form === "section"
                  ? "Новый урок"
                  : form === "task"
                    ? "Новое задание"
                    : "Войти в класс"}
            </h2>
            {(form === "section" || form === "task") && (
              <p>
                Класс «{current?.name}». Материал будет доступен только
                участникам этого класса.
              </p>
            )}
            <form className="stack-form" onSubmit={save}>
              {form === "join" ? (
                <label>
                  Код от учителя
                  <input
                    name="code"
                    required
                    minLength={4}
                    maxLength={16}
                    placeholder="Например, EASY42"
                    autoFocus
                    autoComplete="off"
                  />
                </label>
              ) : (
                <label>
                  Название
                  <input
                    name="title"
                    required
                    minLength={2}
                    maxLength={form === "class" ? 100 : 150}
                    placeholder={
                      form === "class"
                        ? "Например, 4 «А»"
                        : form === "section"
                          ? "Например, Знакомство с алгоритмами"
                          : "Например, Найди дорогу домой"
                    }
                    autoFocus
                  />
                </label>
              )}
              {form === "section" && (
                <label>
                  Теория урока
                  <textarea
                    name="theory"
                    required
                    maxLength={20000}
                    rows={7}
                    placeholder="Объяснение темы и примеры. Материал будет доступен ученикам этого класса."
                  />
                </label>
              )}
              {form === "task" && (
                <>
                  <label>
                    Условие
                    <textarea
                      name="description"
                      required
                      minLength={10}
                      maxLength={4000}
                      rows={4}
                      placeholder="Что должна сделать машина?"
                    />
                  </label>
                  <label>
                    Урок
                    <select
                      name="sectionId"
                      aria-label="Урок"
                      defaultValue={taskLessonId}
                    >
                      <option value="">Отдельное задание, без урока</option>
                      {sections.map((s) => (
                        <option value={s.id} key={s.id}>
                          {s.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Сложность
                    <select name="difficulty" aria-label="Сложность">
                      <option value="easy">Начальный</option>
                      <option value="medium">Средний</option>
                      <option value="hard">Продвинутый</option>
                    </select>
                  </label>
                  <p className="form-note">
                    В первой версии используется поле 8 × 6: старт (1, 4), цель
                    (6, 1). Оценка — достижение цели без столкновений. Редактор
                    карт добавим следующим этапом.
                  </p>
                </>
              )}
              <button className="primary-button" disabled={busy}>
                {busy
                  ? "Сохраняем…"
                  : form === "join"
                    ? "Присоединиться"
                    : form === "section"
                      ? "Создать урок"
                      : form === "class"
                        ? "Создать класс"
                        : "Создать задание"}
                <ArrowRight size={16} />
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
