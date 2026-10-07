import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Boxes,
  Braces,
  Check,
  ChevronDown,
  Code2,
  Flag,
  GraduationCap,
  Menu,
  MessageSquareText,
  MousePointer2,
  Pause,
  Play,
  Repeat2,
  Users,
  X,
} from "lucide-react";
import { useDialog } from "../lib/useDialog";
import { useLandingMotion } from "../lib/useLandingMotion";
import { LandingPreview } from "./LandingPreview";
import { LandingAtmosphere } from "./LandingAtmosphere";
import type { Account } from "../lib/useAccount";
import type { Profile, Role } from "../lib/types";
import "./landing.css";
import "./landing-motion.css";

const AuthPanel = lazy(() =>
  import("./AuthPanel").then((module) => ({ default: module.AuthPanel })),
);
type AuthMode = "login" | "register";
type Props = {
  account: Account;
  initialRole: Role;
  authMode: AuthMode | null;
  onAuth: (mode: AuthMode, role?: Role) => void;
  onCloseAuth: () => void;
  onEnter: () => void;
  onAuthenticated: (profile: Profile) => void;
  onTry: () => void;
};
const topics = [
  "Алгоритмы",
  "Команды",
  "Блоки",
  "Циклы",
  "Условия",
  "Электроника",
  "Итоговый проект",
];

export function LandingPage({
  account,
  initialRole,
  authMode,
  onAuth,
  onCloseAuth,
  onEnter,
  onAuthenticated,
  onTry,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const motion = useLandingMotion(root, Boolean(authMode));
  const [notice, setNotice] = useState("");
  const [faq, setFaq] = useState<number | null>(0);
  const hasAccount = Boolean(account.profile || account.sessionUserId);
  const pendingAccount = !account.ready && !account.error;
  function start() {
    if (hasAccount) onEnter();
    else onAuth("register");
  }
  useDialog(Boolean(authMode), onCloseAuth);
  useEffect(() => {
    document.title = "EasyCode — платформа обучения программированию";
    if (!authMode) setNotice("");
  }, [authMode]);
  function scrollTo(id: string) {
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({
      behavior: motion.enabled ? "smooth" : "instant",
    });
  }
  return (
    <div
      ref={root}
      className={`lp ${motion.enabled ? "lp-motion-on" : "lp-motion-off"}`}
    >
      <a className="lp-skip" href="#lp-main">
        Перейти к содержимому
      </a>
      <section className="lp-intro" data-loop>
        <div className="lp-atmosphere" aria-hidden="true">
          <LandingAtmosphere active={motion.enabled} />
          <svg className="lp-grain" width="100%" height="100%">
            <filter id="lp-noise">
              <feTurbulence
                type="fractalNoise"
                baseFrequency=".78"
                numOctaves="3"
                stitchTiles="stitch"
              />
            </filter>
            <rect
              width="100%"
              height="100%"
              filter="url(#lp-noise)"
              opacity=".17"
            />
          </svg>
        </div>
        <header className="lp-header">
          <a
            className="lp-brand"
            href="/"
            aria-label="EasyCode — главная"
            onClick={(event) => {
              event.preventDefault();
              onCloseAuth();
            }}
          >
            <span className="lp-brand-mark">
              <Code2 size={24} />
            </span>
            EasyCode<span className="lp-brand-period">.</span>
          </a>
          <span className="lp-nav-slash" aria-hidden="true">
            /
          </span>
          <nav
            className={`lp-nav ${menuOpen ? "lp-nav-open" : ""}`}
            aria-label="Основная навигация"
          >
            <a
              href="#features"
              onClick={(e) => {
                e.preventDefault();
                scrollTo("features");
              }}
            >
              Возможности
            </a>
            <a
              href="#practice"
              onClick={(e) => {
                e.preventDefault();
                scrollTo("practice");
              }}
            >
              Практика
            </a>
            <a
              href="#teachers"
              onClick={(e) => {
                e.preventDefault();
                scrollTo("teachers");
              }}
            >
              Учителям
            </a>
            <a
              href="#faq"
              onClick={(e) => {
                e.preventDefault();
                scrollTo("faq");
              }}
            >
              Вопросы
            </a>
          </nav>
          <div className="lp-header-actions">
            <button
              className="lp-motion-toggle"
              aria-label={
                motion.reducedMotion
                  ? "Анимации отключены настройкой устройства"
                  : motion.paused
                    ? "Включить анимации"
                    : "Приостановить анимации"
              }
              title={
                motion.reducedMotion
                  ? "Уменьшение движения включено на устройстве"
                  : motion.paused
                    ? "Включить анимации"
                    : "Приостановить анимации"
              }
              aria-pressed={motion.paused || motion.reducedMotion}
              disabled={motion.reducedMotion}
              onClick={motion.toggle}
            >
              {motion.paused || motion.reducedMotion ? (
                <Play size={16} />
              ) : (
                <Pause size={16} />
              )}
            </button>
            {hasAccount ? (
              <button className="lp-account" onClick={onEnter}>
                <span>{account.profile?.name || "Мой аккаунт"}</span>
                <small>
                  {account.profile
                    ? account.profile.role === "teacher"
                      ? "Учитель"
                      : "Ученик"
                    : "Сессия сохранена"}
                  {account.mode === "demo" ? " · демо" : ""}
                </small>
              </button>
            ) : pendingAccount ? (
              <span className="lp-session-loading" role="status">
                Проверяем вход…
              </span>
            ) : (
              <button className="lp-login" onClick={() => onAuth("login")}>
                Войти <ArrowUpRight size={16} />
              </button>
            )}
            <button
              className={`lp-glow-button lp-header-start ${hasAccount ? "lp-cabinet-button" : ""}`}
              onClick={start}
              disabled={pendingAccount}
            >
              {hasAccount ? "В кабинет" : "Начать обучение"}{" "}
              <ArrowRight size={16} />
            </button>
            <button
              className="lp-menu-toggle"
              aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </header>
        {account.error && (
          <div className="lp-account-error" role="alert">
            <span>
              {account.error} {hasAccount ? "Сессия сохранена." : ""}
            </span>
            <button onClick={account.refresh}>Повторить</button>
          </div>
        )}
        <main id="lp-main">
          <div className="lp-hero">
            <div className="lp-hero-copy">
              <a
                className="lp-announcement"
                href="#practice"
                onClick={(e) => {
                  e.preventDefault();
                  scrollTo("practice");
                }}
              >
                <span>ОБРАЗОВАТЕЛЬНАЯ ПЛАТФОРМА</span>
                <span>БЛОКИ + PYTHON</span>
                <ArrowRight size={15} />
              </a>
              <h1 aria-label="Программирование: от основ к практике.">
                <span className="lp-title-line" aria-hidden="true">
                  {Array.from("Программирование").map((letter, i) => (
                    <span
                      className="lp-letter"
                      style={{ "--letter": i } as React.CSSProperties}
                      key={i}
                    >
                      {letter}
                    </span>
                  ))}
                </span>
                <span
                  className="lp-title-line lp-title-accent"
                  aria-hidden="true"
                >
                  от основ к практике.
                </span>
              </h1>
              <p>
                Последовательный курс для учеников 3–6 классов:
                <br className="lp-desktop-break" /> алгоритмы, визуальные блоки
                и учебный Python.
                <br className="lp-desktop-break" /> Теория, практика и
                результаты в одном кабинете.
              </p>
              <div className="lp-hero-buttons">
                <button
                  className="lp-primary"
                  onClick={start}
                  disabled={pendingAccount}
                >
                  {hasAccount ? "Продолжить в кабинете" : "Начать обучение"}{" "}
                  <ArrowRight size={18} />
                </button>
                <button className="lp-secondary" onClick={onTry}>
                  <Play size={15} fill="currentColor" />
                  {hasAccount ? "Открыть практику" : "Попробовать без входа"}
                </button>
              </div>
              <div className="lp-proof">
                <span>
                  <GraduationCap size={15} />
                  ДЛЯ 3–6 КЛАССОВ
                </span>
                <i />
                <span>6 РАЗДЕЛОВ · 12 ТЕМ</span>
              </div>
            </div>
            <div className="lp-hero-demo" id="practice" data-spotlight>
              <LandingPreview onTry={onTry} />
              <div className="lp-demo-caption">
                <MousePointer2 size={15} />
                <span>Интерактивный пример. Нажмите «Запустить».</span>
              </div>
            </div>
          </div>
          <div className="lp-discover">
            <button onClick={() => scrollTo("features")}>
              Возможности платформы <ArrowDown size={15} />
            </button>
            <span>От изучения алгоритмов к самостоятельным проектам.</span>
          </div>
        </main>
      </section>
      <section className="lp-section lp-features" id="features">
        <div className="lp-section-title" data-reveal>
          <span className="lp-kicker">УЧЕБНАЯ СРЕДА</span>
          <h2>Возможности платформы</h2>
          <p>
            Материалы курса, практические задания и инструменты для учителя.
          </p>
        </div>
        <div className="lp-topic-ribbon" aria-label="Темы курса" data-loop>
          <div className="lp-ribbon-track">
            {[0, 1].map((copy) => (
              <div
                className="lp-ribbon-group"
                key={copy}
                aria-hidden={copy === 1 ? true : undefined}
              >
                {topics.map((topic, i) => (
                  <span key={topic}>
                    <i>{String(i + 1).padStart(2, "0")}</i>
                    {topic}
                    <span className="lp-ribbon-divider" aria-hidden="true" />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="lp-feature-grid">
          <article
            className="lp-feature-card"
            data-reveal
            data-loop
            data-spotlight
          >
            <div
              className="lp-feature-visual lp-block-visual"
              aria-hidden="true"
            >
              <div>
                <Flag size={13} />
                Когда программа начинается
              </div>
              <div>
                <ArrowRight size={13} />
                Вперёд на <b>5</b> клеток
              </div>
              <div>
                <Repeat2 size={13} />
                Повторить <b>3</b> раза
              </div>
              <MousePointer2 className="lp-visual-pointer" size={22} />
            </div>
            <h3>Программирование блоками</h3>
            <p>
              Составление алгоритмов из готовых команд. Визуальная среда
              помогает понять структуру программы без изучения синтаксиса.
            </p>
            <span className="lp-feature-tag">
              <Boxes size={13} />
              Визуальное программирование
            </span>
          </article>
          <article
            className="lp-feature-card"
            data-reveal
            data-loop
            data-spotlight
          >
            <div
              className="lp-feature-visual lp-python-visual"
              aria-hidden="true"
            >
              <div>
                <i />
                first_steps.py
              </div>
              <code>
                <span>for</span> step <span>in</span> range(<b>3</b>):
                <br />
                &nbsp;&nbsp;robot.forward(<b>1</b>)<br />
                &nbsp;&nbsp;robot.turn_right()
                <br />
                <em># Повторить последовательность команд</em>
                <i className="lp-code-caret" />
              </code>
            </div>
            <h3>Переход к Python</h3>
            <p>
              Сравнение блоков и текстовой программы. Управление моделью машины
              с помощью команд учебного Python.
            </p>
            <span className="lp-feature-tag">
              <Braces size={13} />
              Плавный переход к тексту
            </span>
          </article>
          <article
            className="lp-feature-card"
            data-reveal
            data-loop
            data-spotlight
          >
            <div
              className="lp-feature-visual lp-path-visual"
              aria-hidden="true"
            >
              <svg viewBox="0 0 290 140">
                <path d="M32 110H136V34H257" />
                <circle cx="32" cy="110" r="6" />
                <circle cx="136" cy="110" r="5" />
                <circle cx="136" cy="34" r="5" />
                <rect x="243" y="20" width="29" height="29" rx="8" />
                <path d="m251 34 5 5 8-11" className="lp-tick" />
              </svg>
              <span className="lp-path-chip">
                <Check size={12} />
                Маршрут пройден
              </span>
            </div>
            <h3>Проверка алгоритмов</h3>
            <p>
              Выполнение программы в симуляторе, пошаговое наблюдение за
              движением и анализ ошибок.
            </p>
            <span className="lp-feature-tag">
              <Play size={13} />
              Интерактивная практика
            </span>
          </article>
          <article
            className="lp-feature-card"
            data-reveal
            data-loop
            data-spotlight
          >
            <div
              className="lp-feature-visual lp-course-visual"
              aria-hidden="true"
            >
              {["01  Алгоритмы", "02  Блоки", "03  Циклы"].map((text, i) => (
                <div key={text}>
                  <span>{text}</span>
                  {i === 0 ? (
                    <Check size={14} />
                  ) : (
                    <span className="lp-track-dot" />
                  )}
                </div>
              ))}
            </div>
            <h3>Учебная программа</h3>
            <p>
              Шесть разделов: от первой команды до собственного проекта. Теория,
              примеры и практика — рядом.
            </p>
            <span className="lp-feature-tag">
              <BookOpen size={13} />
              12 тем в учебном плане
            </span>
          </article>
          <article
            className="lp-feature-card"
            data-reveal
            data-loop
            data-spotlight
          >
            <div
              className="lp-feature-visual lp-hint-visual"
              aria-hidden="true"
            >
              <span>
                <MessageSquareText size={18} />
              </span>
              <div>
                Как изменится результат,
                <br />
                если поменять порядок команд?
                <i />
              </div>
            </div>
            <h3>Помощь в решении</h3>
            <p>
              Помощник задаёт наводящие вопросы и объясняет работу алгоритма,
              поддерживая самостоятельное решение задач.
            </p>
            <span className="lp-feature-tag">
              <MessageSquareText size={13} />
              AI-помощник по алгоритмам
            </span>
          </article>
          <article
            className="lp-feature-card"
            data-reveal
            data-loop
            data-spotlight
          >
            <div
              className="lp-feature-visual lp-class-visual"
              aria-hidden="true"
            >
              <div className="lp-avatar-row">
                {["А", "М", "Д", "С"].map((letter) => (
                  <span key={letter}>{letter}</span>
                ))}
                <span>+</span>
              </div>
              <span className="lp-class-code">
                УЧЕБНЫЙ КЛАСС <b>4 «А»</b>
              </span>
            </div>
            <h3>Работа в классе</h3>
            <p>
              Подключение к классу по коду учителя, доступ к заданиям и
              сохранение результатов в личном кабинете.
            </p>
            <span className="lp-feature-tag">
              <Users size={13} />
              Совместное обучение
            </span>
          </article>
        </div>
      </section>
      <section className="lp-section lp-teacher-section" id="teachers">
        <div className="lp-teacher-copy" data-reveal>
          <span className="lp-kicker">КАБИНЕТ УЧИТЕЛЯ</span>
          <h2>
            Организация
            <br />
            <span>обучения</span>
          </h2>
          <p>
            Создавайте классы, добавляйте учебные материалы и практические
            задания. Отслеживайте результаты учеников в одном кабинете.
          </p>
          <ul>
            <li>
              <Check size={16} />
              Свой класс и приглашение по коду
            </li>
            <li>
              <Check size={16} />
              Разделы с теорией и практическими заданиями
            </li>
            <li>
              <Check size={16} />
              Результаты учеников в одном кабинете
            </li>
          </ul>
          <button
            className="lp-secondary"
            onClick={() =>
              hasAccount ? onEnter() : onAuth("register", "teacher")
            }
          >
            {hasAccount ? "Открыть кабинет" : "Создать аккаунт учителя"}{" "}
            <ArrowRight size={17} />
          </button>
          <small>
            Выберите роль «Учитель» при регистрации и создайте свой класс.
          </small>
        </div>
        <div
          className="lp-teacher-window"
          data-reveal
          data-loop
          data-spotlight
          aria-label="Пример интерфейса кабинета учителя"
        >
          <div className="lp-window-bar">
            <span>
              <i />
              <i />
              <i />
            </span>
            <span>Кабинет учителя</span>
            <span>Пример</span>
          </div>
          <div className="lp-teacher-window-body">
            <div className="lp-class-title">
              <span>
                <Users size={22} />
              </span>
              <div>
                <h3>Программирование · 4 «А»</h3>
                <p>Материалы и задания класса</p>
              </div>
            </div>
            <div className="lp-assignment-example">
              <span>
                <BookOpen size={16} />
                РАЗДЕЛ 01
              </span>
              <h4>Команды и последовательности</h4>
              <p>Как превратить план действий в программу?</p>
              <div>
                <span>Теория</span>
                <span>Практика</span>
                <span>Результаты</span>
              </div>
            </div>
            <div className="lp-teacher-example-row">
              <span className="lp-mini-avatar">А</span>
              <span>
                Маршрут к флагу<small>Задание для машины</small>
              </span>
              <span className="lp-example-status">
                <Check size={13} />
                Выполнено
              </span>
            </div>
            <div className="lp-teacher-example-row">
              <span className="lp-mini-avatar lp-mini-alt">М</span>
              <span>
                Маршрут к флагу<small>Задание для машины</small>
              </span>
              <span className="lp-example-status lp-in-progress">
                В процессе
              </span>
            </div>
          </div>
        </div>
      </section>
      <section className="lp-section lp-steps-section">
        <div className="lp-section-title" data-reveal>
          <span className="lp-kicker">НАЧАЛО РАБОТЫ</span>
          <h2>Как начать обучение</h2>
        </div>
        <div className="lp-steps">
          {[
            {
              title: "Создайте аккаунт",
              text: "Выберите роль ученика или учителя при регистрации.",
              icon: Users,
            },
            {
              title: "Изучите первую тему",
              text: "Прочитайте материал и выполните задания для самопроверки.",
              icon: BookOpen,
            },
            {
              title: "Перейдите к практике",
              text: "Составьте программу и проверьте её работу в симуляторе.",
              icon: Play,
            },
          ].map((step, i) => (
            <article
              key={step.title}
              data-reveal
              style={{ "--reveal-delay": `${i * 90}ms` } as React.CSSProperties}
            >
              <span className="lp-step-number">0{i + 1}</span>
              <step.icon size={22} />
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="lp-section lp-faq" id="faq">
        <div className="lp-section-title" data-reveal>
          <span className="lp-kicker">О ПЛАТФОРМЕ</span>
          <h2>Частые вопросы</h2>
        </div>
        <div className="lp-faq-list" data-reveal>
          {[
            [
              "Нужно ли уже уметь программировать?",
              "Нет. Начинаем с простых команд и визуальных блоков. Учебный план рассчитан на учеников 3–6 классов, которые только знакомятся с программированием.",
            ],
            [
              "Можно сначала попробовать без регистрации?",
              "Да. Демонстрация на главной и практическая среда работают без входа. Аккаунт понадобится для вступления в класс, сохранения проверенных решений и AI-подсказок.",
            ],
            [
              "Чем блоки отличаются от Python?",
              "В блочном режиме программа составляется из готовых команд, в текстовом — команды вводятся вручную. Машина исполняет один и тот же набор действий. Сейчас доступно учебное подмножество Python: движение, циклы и условия.",
            ],
            [
              "Как подключить учеников к классу?",
              "Учитель создаёт класс в своём кабинете и передаёт ученикам код приглашения. После входа ученик вводит код и получает доступ к материалам и заданиям класса.",
            ],
            [
              "Все разделы уже готовы?",
              "Для всех 6 разделов и 12 тем доступны веб-уроки с примерами, самопроверкой и прогрессом. Практика с машиной уже работает. Расширенные упражнения, робот и симулятор электронных компонентов будут появляться постепенно.",
            ],
          ].map(([question, answer], i) => (
            <article key={question}>
              <h3>
                <button
                  aria-expanded={faq === i}
                  aria-controls={`lp-faq-${i}`}
                  onClick={() => setFaq(faq === i ? null : i)}
                >
                  {question}
                  <ChevronDown size={18} />
                </button>
              </h3>
              <div id={`lp-faq-${i}`} hidden={faq !== i}>
                <p>{answer}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="lp-final-cta" data-loop>
        <div className="lp-cta-orbit" aria-hidden="true" />
        <span className="lp-kicker">ОБУЧЕНИЕ НА EASYCODE</span>
        <h2>
          Изучайте программирование
          <br />
          <span>на практике</span>
        </h2>
        <p>
          Учебные материалы, симулятор и работа в классе на одной платформе.
        </p>
        <div>
          <button
            className="lp-primary"
            onClick={start}
            disabled={pendingAccount}
          >
            {hasAccount ? "Продолжить в кабинете" : "Начать обучение"}{" "}
            <ArrowRight size={18} />
          </button>
          <button className="lp-text-button" onClick={onTry}>
            {hasAccount ? "Открыть практику" : "Открыть демоверсию"}{" "}
            <ArrowUpRight size={17} />
          </button>
        </div>
      </section>
      <footer className="lp-footer">
        <div>
          <a
            className="lp-brand"
            href="/"
            aria-label="EasyCode — на главную"
            onClick={(event) => {
              event.preventDefault();
              onCloseAuth();
            }}
          >
            <span className="lp-brand-mark">
              <Code2 size={22} />
            </span>
            EasyCode<span className="lp-brand-period">.</span>
          </a>
          <p>Платформа обучения программированию</p>
        </div>
        <nav aria-label="Навигация в подвале">
          <a
            href="#features"
            onClick={(e) => {
              e.preventDefault();
              scrollTo("features");
            }}
          >
            О платформе
          </a>
          <a
            href="#teachers"
            onClick={(e) => {
              e.preventDefault();
              scrollTo("teachers");
            }}
          >
            Учителям
          </a>
          <button onClick={() => (hasAccount ? onEnter() : onAuth("login"))}>
            {hasAccount ? "В кабинет" : "Войти"} <ArrowUpRight size={14} />
          </button>
        </nav>
        <div className="lp-footer-bottom">
          <span>© {new Date().getFullYear()} EasyCode</span>
          <span>Образовательная платформа</span>
        </div>
      </footer>
      {authMode && (
        <div className="modal-overlay lp-auth-overlay" onClick={onCloseAuth}>
          <section
            className="modal lp-auth-modal"
            role="dialog"
            aria-modal="true"
            aria-label={
              authMode === "login"
                ? "Вход в EasyCode"
                : "Регистрация в EasyCode"
            }
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label="Закрыть"
              onClick={onCloseAuth}
            >
              <X size={20} />
            </button>
            <span className="lp-auth-brand">
              <Code2 size={22} />
              EasyCode
            </span>
            <Suspense fallback={<p role="status">Открываем форму…</p>}>
              <AuthPanel
                key={`${authMode}:${initialRole}`}
                initialMode={authMode}
                initialRole={initialRole}
                onModeChange={onAuth}
                onComplete={onAuthenticated}
                onNotice={setNotice}
              />
            </Suspense>
            {notice && (
              <p className="lp-auth-error" role="alert">
                {notice}
              </p>
            )}
            <button className="lp-auth-demo" onClick={onTry}>
              Продолжить без входа <ArrowRight size={14} />
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
