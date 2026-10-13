import { t } from "../lib/i18n";
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
const coverCommands = [
  "start → move → finish",
  "when start → move(5)",
  "repeat(3) { move() }",
  "if path_clear: move()",
  "sensor → code → action",
  "build → run → improve",
];
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
    `${t(s.title)} ${s.title} ${s.topics.map((topic) => `${t(topic.title)} ${topic.title}`).join(" ")}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <div className="course-page page-container">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="purple-dash" />
            {t("ОСНОВЫ ПРОГРАММИРОВАНИЯ")}
          </span>
          <h1>{t("Учебный курс")}</h1>
          <p>
            {t(
              "Теория, примеры и практические задания по основам программирования. Создание алгоритмов с помощью блоков и текстового кода.",
            )}
          </p>
          <div className="hero-actions">
            <button
              className="primary-button"
              disabled={!continueTopic}
              onClick={() => continueTopic && onTopic(continueTopic)}
            >
              {t(
                coursePercent > 0
                  ? "Продолжить обучение"
                  : "Начать первую тему",
              )}
              {t(" ")}
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
              {t("Программа курса ")}
              <ArrowDown size={16} />
            </button>
          </div>
          <div className="hero-facts">
            <span>
              <BookOpen size={14} />
              {t("6 разделов")}
            </span>
            <span>
              <Layers3 size={14} />
              {t("12 тем")}
            </span>
            <span>
              <Braces size={14} />
              {t("Блоки + код")}
            </span>
          </div>
        </div>
        <div
          className="hero-visual"
          aria-label={t("Иллюстрация: команды управляют машиной")}
        >
          <div className="floating-label">
            <span className="status-dot" />
            {t("Пример программы")}
          </div>
          <div className="visual-grid">
            <svg viewBox="0 0 420 310" className="route-art" aria-hidden="true">
              <defs>
                <linearGradient id="route-gradient" x1="0" y1="1" x2="1" y2="0">
                  <stop stopColor="#3b82f6" />
                  <stop offset="1" stopColor="#d4e8ff" />
                </linearGradient>
              </defs>
              <path
                d="M72 241 H275 Q298 241 298 218 V90"
                fill="none"
                stroke="#3b82f6"
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
              <circle cx="72" cy="241" r="7" fill="#3b82f6" />
              <rect
                x="284"
                y="71"
                width="29"
                height="29"
                rx="9"
                fill="#263649"
                stroke="#79b6fc"
              />
              <path
                d="m292 85 5 5 8-10"
                fill="none"
                stroke="#a8d1ff"
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
              <Play size={10} fill="currentColor" />
              {t(" Управление движением")}
            </span>
          </div>
        </div>
      </section>
      <section className="course-progress" aria-label={t("Прогресс обучения")}>
        <div className="course-progress-heading">
          <span className="course-progress-icon">
            <BookOpen size={21} />
          </span>
          <div>
            <span className="eyebrow">{t("МОЙ ПРОГРЕСС")}</span>
            <h2>
              {t(completed)}
              {t(" из ")}
              {t(topics.length || 12)}
              {t(" тем пройдено")}
            </h2>
          </div>
          <strong>
            {t(coursePercent)}
            <span>%</span>
          </strong>
        </div>
        <div
          className="course-progress-track"
          role="progressbar"
          aria-label={t("Прогресс всего курса")}
          aria-valuenow={coursePercent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: `${coursePercent}%` }} />
        </div>
        <div className="course-progress-footer">
          <span>
            <Cloud size={14} />
            {t(
              storage === "loading"
                ? "Загружаем прогресс…"
                : storage === "cloud"
                  ? "Прогресс сохранён в аккаунте"
                  : storage === "unavailable"
                    ? "Прогресс доступен только до обновления страницы"
                    : storageError
                      ? "Прогресс хранится только в этом браузере"
                      : "Гостевой прогресс хранится в этом браузере",
            )}
          </span>
          {t(
            continueTopic && (
              <button
                className="text-button"
                onClick={() => onTopic(continueTopic)}
              >
                {t("Тема ")}
                {t(continueTopic.number)} <ArrowRight size={14} />
              </button>
            ),
          )}
        </div>
        {t(
          storageError && (
            <p className="course-progress-warning" role="status">
              {t(storageError)}
            </p>
          ),
        )}
      </section>
      <div className="course-strip">
        <span className="strip-icon">
          <Terminal size={20} />
        </span>
        <div>
          <strong>{t("Практическая среда")}</strong>
          <span>
            {t("Редактор блоков, текстовый код и проверка программ.")}
          </span>
        </div>
        <button className="text-button" onClick={onPractice}>
          {t("Открыть среду ")}
          <ArrowUpRightIcon />
        </button>
      </div>
      <section id="curriculum" className="curriculum">
        <div className="section-heading">
          <div>
            <span className="eyebrow">{t("СОДЕРЖАНИЕ")}</span>
            <h2>{t("Программа курса")}</h2>
          </div>
          <span className="count-chip">
            {t("6 разделов ")}
            <span>·</span>
            {t(" 12 тем")}
          </span>
        </div>
        {t(
          !catalog && (
            <div className="empty-state">{t("Загружаем учебный план…")}</div>
          ),
        )}
        {t(
          filtered?.length === 0 && (
            <div className="empty-state">
              {t("По запросу «")}
              {t(query)}
              {t("» ничего не найдено.")}
            </div>
          ),
        )}
        <div className="course-grid">
          {t(
            filtered?.map((section) => {
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
                  <div className="course-cover" aria-hidden="true">
                    <span className="course-cover-label">
                      {t("БЛОКИ / PYTHON")}
                    </span>
                    <Icon size={48} strokeWidth={1.5} />
                    <code>{coverCommands[section.number - 1]}</code>
                    <span className="course-cover-number">
                      {t(String(section.number).padStart(2, "0"))}
                    </span>
                  </div>
                  <div className="card-top">
                    <span className="section-number">
                      {t("РАЗДЕЛ ")}
                      {t(String(section.number).padStart(2, "0"))}
                    </span>
                    <span
                      className={`availability ${available ? "ready" : ""}`}
                    >
                      {t(
                        sectionDone === section.topics.length
                          ? "Пройдено"
                          : available
                            ? "Доступно"
                            : "В плане",
                      )}
                    </span>
                  </div>
                  <h3>{t(section.title)}</h3>
                  <p>{t(descriptions[section.number - 1])}</p>
                  <div className="topic-links">
                    {t(
                      section.topics.map((topic) => (
                        <button
                          key={topic.number}
                          aria-label={`${topic.number} ${t(topic.title)}`}
                          onClick={() => onTopic(topic)}
                        >
                          <span>{t(topic.number)}</span>
                          {t(topic.title)}
                          {t(
                            topicPercent(topic) === 100 ? (
                              <Check className="topic-done" size={16} />
                            ) : topicPercent(topic) > 0 ? (
                              <small className="topic-progress-value">
                                {t(topicPercent(topic))}%
                              </small>
                            ) : (
                              <ChevronRight size={14} />
                            ),
                          )}
                        </button>
                      )),
                    )}
                  </div>
                  <div
                    className="section-progress-track"
                    role="progressbar"
                    aria-label={t(`Прогресс раздела ${section.number}`)}
                    aria-valuenow={sectionPercent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <span style={{ width: `${sectionPercent}%` }} />
                  </div>
                  <div className="card-bottom">
                    <span>
                      <BookOpen size={13} />
                      {t(sectionDone)} / {t(section.topics.length)}
                      {t(" пройдено")}
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
                      {t(
                        sectionDone > 0 && sectionDone < section.topics.length
                          ? "Продолжить"
                          : "Открыть раздел",
                      )}
                      {t(" ")}
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </article>
              );
            }),
          )}
        </div>
      </section>
      <section className="bottom-cta">
        <span className="cta-icon">
          <Terminal size={25} />
        </span>
        <div>
          <h3>{t("Практика программирования")}</h3>
          <p>
            {t("Составление алгоритмов и проверка маршрутов в симуляторе.")}
          </p>
        </div>
        <button className="secondary-button" onClick={onPractice}>
          {t("Перейти к практике ")}
          <ArrowRight size={16} />
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
