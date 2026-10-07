import {
  ArrowDown,
  ArrowRight,
  BookOpen,
  Braces,
  ChevronRight,
  CircuitBoard,
  Check,
  Cloud,
  Flag,
  GitBranch,
  Layers3,
  Play,
  Repeat2,
  Route,
  Terminal,
} from "lucide-react";
import type { Catalog, Topic } from "../lib/types";
import { lessonPercent, type LessonProgress } from "../../shared/lessons";
import "./course-progress.css";
const icons = [Route, Layers3, Repeat2, GitBranch, CircuitBoard, Flag];
const descriptions = [
  "Алгоритмы, команды и последовательность действий.",
  "Создание и запуск программ в блочной среде.",
  "Циклы и повторение последовательности команд.",
  "Условия и выбор действий в программе.",
  "Программное управление датчиками, светом и движением.",
  "Разработка и проверка собственного проекта.",
];
export function Course({
  catalog,
  query,
  onTopic,
  onPractice,
  progress,
  storage,
  storageError,
}: {
  catalog: Catalog | null;
  query: string;
  onTopic: (topic: Topic) => void;
  onPractice: () => void;
  progress: Record<string, LessonProgress>;
  storage: "loading" | "cloud" | "local" | "unavailable";
  storageError: string;
}) {
  const topics = catalog?.sections.flatMap((section) => section.topics) || [];
  const topicPercent = (topic: Topic) =>
    topic.lesson
      ? lessonPercent(
          { steps: topic.lesson.stepIds.map((id) => ({ id })) },
          progress[topic.number],
        )
      : 0;
  const completed = topics.filter(
    (topic) => topicPercent(topic) === 100,
  ).length;
  const coursePercent = topics.length
    ? Math.round(
        topics.reduce((sum, topic) => sum + topicPercent(topic), 0) /
          topics.length,
      )
    : 0;
  const continueTopic =
    topics.find(
      (topic) => topicPercent(topic) > 0 && topicPercent(topic) < 100,
    ) ||
    topics.find((topic) => topic.lesson && topicPercent(topic) < 100) ||
    topics[0];
  const filtered = catalog?.sections.filter((s) =>
    `${s.title} ${s.topics.map((t) => t.title).join(" ")}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <div className="course-page page-container">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="purple-dash" />
            ОСНОВЫ ПРОГРАММИРОВАНИЯ
          </span>
          <h1>Учебный курс</h1>
          <p>
            Теория, примеры и практические задания по основам программирования.
            Создание алгоритмов с помощью блоков и текстового кода.
          </p>
          <div className="hero-actions">
            <button
              className="primary-button"
              disabled={!continueTopic}
              onClick={() => continueTopic && onTopic(continueTopic)}
            >
              {coursePercent > 0 ? "Продолжить обучение" : "Начать первую тему"}{" "}
              <ArrowRight size={17} />
            </button>
            <button
              className="text-button"
              onClick={() =>
                document
                  .getElementById("curriculum")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
            >
              Программа курса <ArrowDown size={16} />
            </button>
          </div>
          <div className="hero-facts">
            <span>
              <BookOpen size={14} />6 разделов
            </span>
            <span>
              <Layers3 size={14} />
              12 тем
            </span>
            <span>
              <Braces size={14} />
              Блоки + код
            </span>
          </div>
        </div>
        <div
          className="hero-visual"
          aria-label="Иллюстрация: команды управляют машиной"
        >
          <div className="floating-label">
            <span className="status-dot" />
            Пример программы
          </div>
          <div className="visual-grid">
            <svg viewBox="0 0 420 310" className="route-art" aria-hidden="true">
              <defs>
                <linearGradient id="route-gradient" x1="0" y1="1" x2="1" y2="0">
                  <stop stopColor="#a855f7" />
                  <stop offset="1" stopColor="#e6d4ff" />
                </linearGradient>
              </defs>
              <path
                d="M72 241 H275 Q298 241 298 218 V90"
                fill="none"
                stroke="#a855f7"
                strokeWidth="36"
                opacity=".08"
              />
              <path
                d="M72 241 H275 Q298 241 298 218 V90"
                fill="none"
                stroke="url(#route-gradient)"
                strokeWidth="3"
                strokeDasharray="7 7"
              />
              <circle cx="72" cy="241" r="7" fill="#a855f7" />
              <rect
                x="284"
                y="71"
                width="29"
                height="29"
                rx="9"
                fill="#392649"
                stroke="#b879fc"
              />
              <path
                d="m292 85 5 5 8-10"
                fill="none"
                stroke="#d4a8ff"
                strokeWidth="2"
              />
            </svg>
            <div className="hero-car">
              <div className="car-body">
                <i />
                <i />
                <span />
              </div>
            </div>
          </div>
          <div className="code-float">
            <div>
              <span />
              <span />
              <span />
              <small>hello_world.py</small>
            </div>
            <code>
              <em>robot</em>.forward(<b>5</b>)<br />
              <em>robot</em>.turn_left()
              <br />
              <em>robot</em>.forward(<b>3</b>)
            </code>
            <span className="code-caption">
              <Play size={10} fill="currentColor" /> Управление движением
            </span>
          </div>
        </div>
      </section>
      <section className="course-progress" aria-label="Прогресс обучения">
        <div className="course-progress-heading">
          <span className="course-progress-icon">
            <BookOpen size={21} />
          </span>
          <div>
            <span className="eyebrow">МОЙ ПРОГРЕСС</span>
            <h2>
              {completed} из {topics.length || 12} тем пройдено
            </h2>
          </div>
          <strong>
            {coursePercent}
            <span>%</span>
          </strong>
        </div>
        <div
          className="course-progress-track"
          role="progressbar"
          aria-label="Прогресс всего курса"
          aria-valuenow={coursePercent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: `${coursePercent}%` }} />
        </div>
        <div className="course-progress-footer">
          <span>
            <Cloud size={14} />
            {storage === "loading"
              ? "Загружаем прогресс…"
              : storage === "cloud"
                ? "Прогресс сохранён в аккаунте"
                : storage === "unavailable"
                  ? "Прогресс доступен только до обновления страницы"
                  : storageError
                    ? "Прогресс хранится только в этом браузере"
                    : "Гостевой прогресс хранится в этом браузере"}
          </span>
          {continueTopic && (
            <button
              className="text-button"
              onClick={() => onTopic(continueTopic)}
            >
              Тема {continueTopic.number} <ArrowRight size={14} />
            </button>
          )}
        </div>
        {storageError && (
          <p className="course-progress-warning" role="status">
            {storageError}
          </p>
        )}
      </section>
      <div className="course-strip">
        <span className="strip-icon">
          <Terminal size={20} />
        </span>
        <div>
          <strong>Практическая среда</strong>
          <span>Редактор блоков, текстовый код и проверка программ.</span>
        </div>
        <button className="text-button" onClick={onPractice}>
          Открыть среду <ArrowUpRightIcon />
        </button>
      </div>
      <section id="curriculum" className="curriculum">
        <div className="section-heading">
          <div>
            <span className="eyebrow">СОДЕРЖАНИЕ</span>
            <h2>Программа курса</h2>
          </div>
          <span className="count-chip">
            6 разделов <span>·</span> 12 тем
          </span>
        </div>
        {!catalog && <div className="empty-state">Загружаем учебный план…</div>}
        {filtered?.length === 0 && (
          <div className="empty-state">
            По запросу «{query}» ничего не найдено.
          </div>
        )}
        <div className="course-grid">
          {filtered?.map((section) => {
            const Icon = icons[section.number - 1];
            const available = section.topics.every((t) => t.lesson);
            const sectionDone = section.topics.filter(
              (topic) => topicPercent(topic) === 100,
            ).length;
            const sectionPercent = Math.round(
              section.topics.reduce(
                (sum, topic) => sum + topicPercent(topic),
                0,
              ) / section.topics.length,
            );
            return (
              <article
                className="course-card"
                id={`section-${section.number}`}
                key={section.number}
              >
                <div className="card-top">
                  <span className="course-icon">
                    <Icon size={23} />
                  </span>
                  <span className="section-number">
                    РАЗДЕЛ {String(section.number).padStart(2, "0")}
                  </span>
                  <span className={`availability ${available ? "ready" : ""}`}>
                    {sectionDone === section.topics.length
                      ? "Пройдено"
                      : available
                        ? "Доступно"
                        : "В плане"}
                  </span>
                </div>
                <h3>{section.title}</h3>
                <p>{descriptions[section.number - 1]}</p>
                <div className="topic-links">
                  {section.topics.map((topic) => (
                    <button
                      key={topic.number}
                      aria-label={`${topic.number} ${topic.title}`}
                      onClick={() => onTopic(topic)}
                    >
                      <span>{topic.number}</span>
                      {topic.title}
                      {topicPercent(topic) === 100 ? (
                        <Check className="topic-done" size={16} />
                      ) : topicPercent(topic) > 0 ? (
                        <small className="topic-progress-value">
                          {topicPercent(topic)}%
                        </small>
                      ) : (
                        <ChevronRight size={14} />
                      )}
                    </button>
                  ))}
                </div>
                <div
                  className="section-progress-track"
                  role="progressbar"
                  aria-label={`Прогресс раздела ${section.number}`}
                  aria-valuenow={sectionPercent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <span style={{ width: `${sectionPercent}%` }} />
                </div>
                <div className="card-bottom">
                  <span>
                    <BookOpen size={13} />
                    {sectionDone} / {section.topics.length} пройдено
                  </span>
                  <button
                    onClick={() =>
                      onTopic(
                        section.topics.find(
                          (topic) => topicPercent(topic) < 100,
                        ) || section.topics[0],
                      )
                    }
                  >
                    {sectionDone > 0 && sectionDone < section.topics.length
                      ? "Продолжить"
                      : "Открыть раздел"}{" "}
                    <ArrowRight size={14} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
      <section className="bottom-cta">
        <span className="cta-icon">
          <Terminal size={25} />
        </span>
        <div>
          <h3>Практика программирования</h3>
          <p>Составление алгоритмов и проверка маршрутов в симуляторе.</p>
        </div>
        <button className="secondary-button" onClick={onPractice}>
          Перейти к практике <ArrowRight size={16} />
        </button>
      </section>
    </div>
  );
}
function ArrowUpRightIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
    >
      <path d="M7 17 17 7M7 7h10v10" />
    </svg>
  );
}
