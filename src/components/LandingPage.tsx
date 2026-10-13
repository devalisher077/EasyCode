import { t, useLanguage } from "../lib/i18n";
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
import { LanguageSwitcher } from "./LanguageSwitcher";
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
  const language = useLanguage();
  const hasAccount = Boolean(account.profile || account.sessionUserId);
  const pendingAccount = !account.ready && !account.error;
  function start() {
    if (hasAccount) onEnter();
    else onAuth("register");
  }
  useDialog(Boolean(authMode), onCloseAuth);
  useEffect(() => {
    document.title = t("EasyCode — платформа обучения программированию");
    if (!authMode) setNotice("");
  }, [authMode, language]);
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
        {t("Перейти к содержимому")}
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
            aria-label={t("EasyCode — главная")}
            onClick={(event) => {
              event.preventDefault();
              onCloseAuth();
            }}
          >
            EasyCode
          </a>
          <span className="lp-nav-slash" aria-hidden="true">
            /
          </span>
          <nav
            className={`lp-nav ${menuOpen ? "lp-nav-open" : ""}`}
            aria-label={t("Основная навигация")}
          >
            <a
              href="#features"
              onClick={(e) => {
                e.preventDefault();
                scrollTo("features");
              }}
            >
              {t("Возможности")}
            </a>
            <a
              href="#practice"
              onClick={(e) => {
                e.preventDefault();
                scrollTo("practice");
              }}
            >
              {t("Практика")}
            </a>
            <a
              href="#teachers"
              onClick={(e) => {
                e.preventDefault();
                scrollTo("teachers");
              }}
            >
              {t("Учителям")}
            </a>
            <a
              href="#faq"
              onClick={(e) => {
                e.preventDefault();
                scrollTo("faq");
              }}
            >
              {t("Вопросы")}
            </a>
          </nav>
          <div className="lp-header-actions">
            <LanguageSwitcher />
            <button
              className="lp-motion-toggle"
              aria-label={t(
                motion.reducedMotion
                  ? "Анимации отключены настройкой устройства"
                  : motion.paused
                    ? "Включить анимации"
                    : "Приостановить анимации",
              )}
              title={t(
                motion.reducedMotion
                  ? "Уменьшение движения включено на устройстве"
                  : motion.paused
                    ? "Включить анимации"
                    : "Приостановить анимации",
              )}
              aria-pressed={motion.paused || motion.reducedMotion}
              disabled={motion.reducedMotion}
              onClick={motion.toggle}
            >
              {t(
                motion.paused || motion.reducedMotion ? (
                  <Play size={16} />
                ) : (
                  <Pause size={16} />
                ),
              )}
            </button>
            {hasAccount ? (
              <button className="lp-account" onClick={onEnter}>
                <span>{account.profile?.name || t("Мой аккаунт")}</span>
                <small>
                  {t(
                    account.profile
                      ? account.profile.role === "teacher"
                        ? "Учитель"
                        : "Ученик"
                      : "Сессия сохранена",
                  )}
                  {t(account.mode === "demo" ? " · демо" : "")}
                </small>
              </button>
            ) : pendingAccount ? (
              <span className="lp-session-loading" role="status">
                {t("Проверяем вход…")}
              </span>
            ) : (
              <button className="lp-login" onClick={() => onAuth("login")}>
                {t("Войти ")}
                <ArrowUpRight size={16} />
              </button>
            )}
            <button
              className={`lp-glow-button lp-header-start ${hasAccount ? "lp-cabinet-button" : ""}`}
              onClick={start}
              disabled={pendingAccount}
            >
              {t(hasAccount ? "В кабинет" : "Начать обучение")}
              {t(" ")}
              <ArrowRight size={16} />
            </button>
            <button
              className="lp-menu-toggle"
              aria-label={t(menuOpen ? "Закрыть меню" : "Открыть меню")}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {t(menuOpen ? <X size={22} /> : <Menu size={22} />)}
            </button>
          </div>
        </header>
        {t(
          account.error && (
            <div className="lp-account-error" role="alert">
              <span>
                {t(account.error)} {t(hasAccount ? "Сессия сохранена." : "")}
              </span>
              <button onClick={account.refresh}>{t("Повторить")}</button>
            </div>
          ),
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
                <span>{t("ОБРАЗОВАТЕЛЬНАЯ ПЛАТФОРМА")}</span>
                <span>{t("БЛОКИ + PYTHON")}</span>
                <ArrowRight size={15} />
              </a>
              <h1 aria-label={t("Программирование: от основ к практике.")}>
                <span className="lp-title-line" aria-hidden="true">
                  {t(
                    Array.from(t("Программирование")).map((letter, i) => (
                      <span
                        className="lp-letter"
                        style={{ "--letter": i } as React.CSSProperties}
                        key={i}
                      >
                        {letter}
                      </span>
                    )),
                  )}
                </span>
                <span
                  className="lp-title-line lp-title-accent"
                  aria-hidden="true"
                >
                  {t("от основ к практике.")}
                </span>
              </h1>
              <p>
                {t("Последовательный курс для учеников 3–6 классов:")}
                <br className="lp-desktop-break" />
                {t(" алгоритмы, визуальные блоки и учебный Python.")}
                <br className="lp-desktop-break" />
                {t(" Теория, практика и результаты в одном кабинете.")}
              </p>
              <div className="lp-hero-buttons">
                <button
                  className="lp-primary"
                  onClick={start}
                  disabled={pendingAccount}
                >
                  {t(hasAccount ? "Продолжить в кабинете" : "Начать обучение")}
                  {t(" ")}
                  <ArrowRight size={18} />
                </button>
                <button className="lp-secondary" onClick={onTry}>
                  <Play size={15} fill="currentColor" />
                  {t(hasAccount ? "Открыть практику" : "Попробовать без входа")}
                </button>
              </div>
            </div>
            <div className="lp-hero-demo" id="practice" data-spotlight>
              <LandingPreview onTry={onTry} />
              <div className="lp-demo-caption">
                <MousePointer2 size={15} />
                <span>{t("Интерактивный пример. Нажмите «Запустить».")}</span>
              </div>
            </div>
          </div>
          <div className="lp-discover">
            <button onClick={() => scrollTo("features")}>
              {t("Возможности платформы ")}
              <ArrowDown size={15} />
            </button>
            <span>
              {t("От изучения алгоритмов к самостоятельным проектам.")}
            </span>
          </div>
        </main>
      </section>
      <section className="lp-section lp-features" id="features">
        <div className="lp-section-title" data-reveal>
          <span className="lp-kicker">{t("УЧЕБНАЯ СРЕДА")}</span>
          <h2>{t("Возможности платформы")}</h2>
          <p>
            {t(
              "Материалы курса, практические задания и инструменты для учителя.",
            )}
          </p>
        </div>
        <div className="lp-topic-ribbon" aria-label={t("Темы курса")} data-loop>
          <div className="lp-ribbon-track">
            {t(
              [0, 1].map((copy) => (
                <div
                  className="lp-ribbon-group"
                  key={copy}
                  aria-hidden={copy === 1 ? true : undefined}
                >
                  {t(
                    topics.map((topic, i) => (
                      <span key={topic}>
                        <i>{t(String(i + 1).padStart(2, "0"))}</i>
                        {t(topic)}
                        <span
                          className="lp-ribbon-divider"
                          aria-hidden="true"
                        />
                      </span>
                    )),
                  )}
                </div>
              )),
            )}
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
                {t("Когда программа начинается")}
              </div>
              <div>
                <ArrowRight size={13} />
                {t("Вперёд на ")}
                <b>5</b>
                {t(" клеток")}
              </div>
              <div>
                <Repeat2 size={13} />
                {t("Повторить ")}
                <b>3</b>
                {t(" раза")}
              </div>
              <MousePointer2 className="lp-visual-pointer" size={22} />
            </div>
            <h3>{t("Программирование блоками")}</h3>
            <p>
              {t(
                "Составление алгоритмов из готовых команд. Визуальная среда помогает понять структуру программы без изучения синтаксиса.",
              )}
            </p>
            <span className="lp-feature-tag">
              <Boxes size={13} />
              {t("Визуальное программирование")}
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
                <em>{t("# Повторить последовательность команд")}</em>
                <i className="lp-code-caret" />
              </code>
            </div>
            <h3>{t("Переход к Python")}</h3>
            <p>
              {t(
                "Сравнение блоков и текстовой программы. Управление моделью машины с помощью команд учебного Python.",
              )}
            </p>
            <span className="lp-feature-tag">
              <Braces size={13} />
              {t("Плавный переход к тексту")}
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
                {t("Маршрут пройден")}
              </span>
            </div>
            <h3>{t("Проверка алгоритмов")}</h3>
            <p>
              {t(
                "Выполнение программы в симуляторе, пошаговое наблюдение за движением и анализ ошибок.",
              )}
            </p>
            <span className="lp-feature-tag">
              <Play size={13} />
              {t("Интерактивная практика")}
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
              {t(
                ["01  Алгоритмы", "02  Блоки", "03  Циклы"].map((text, i) => (
                  <div key={text}>
                    <span>{t(text)}</span>
                    {t(
                      i === 0 ? (
                        <Check size={14} />
                      ) : (
                        <span className="lp-track-dot" />
                      ),
                    )}
                  </div>
                )),
              )}
            </div>
            <h3>{t("Учебная программа")}</h3>
            <p>
              {t(
                "Шесть разделов: от первой команды до собственного проекта. Теория, примеры и практика — рядом.",
              )}
            </p>
            <span className="lp-feature-tag">
              <BookOpen size={13} />
              {t("12 тем в учебном плане")}
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
                {t("Как изменится результат,")}
                <br />
                {t("если поменять порядок команд?")}
                <i />
              </div>
            </div>
            <h3>{t("Помощь в решении")}</h3>
            <p>
              {t(
                "Помощник задаёт наводящие вопросы и объясняет работу алгоритма, поддерживая самостоятельное решение задач.",
              )}
            </p>
            <span className="lp-feature-tag">
              <MessageSquareText size={13} />
              {t("AI-помощник по алгоритмам")}
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
                {t(
                  ["А", "М", "Д", "С"].map((letter) => (
                    <span key={letter}>{t(letter)}</span>
                  )),
                )}
                <span>+</span>
              </div>
              <span className="lp-class-code">
                {t("УЧЕБНЫЙ КЛАСС ")}
                <b>{t("4 «А»")}</b>
              </span>
            </div>
            <h3>{t("Работа в классе")}</h3>
            <p>
              {t(
                "Подключение к классу по коду учителя, доступ к заданиям и сохранение результатов в личном кабинете.",
              )}
            </p>
            <span className="lp-feature-tag">
              <Users size={13} />
              {t("Совместное обучение")}
            </span>
          </article>
        </div>
      </section>
      <section className="lp-section lp-teacher-section" id="teachers">
        <div className="lp-teacher-copy" data-reveal>
          <span className="lp-kicker">{t("КАБИНЕТ УЧИТЕЛЯ")}</span>
          <h2>
            {t("Организация")}
            <br />
            <span>{t("обучения")}</span>
          </h2>
          <p>
            {t(
              "Создавайте классы, добавляйте учебные материалы и практические задания. Отслеживайте результаты учеников в одном кабинете.",
            )}
          </p>
          <ul>
            <li>
              <Check size={16} />
              {t("Свой класс и приглашение по коду")}
            </li>
            <li>
              <Check size={16} />
              {t("Разделы с теорией и практическими заданиями")}
            </li>
            <li>
              <Check size={16} />
              {t("Результаты учеников в одном кабинете")}
            </li>
          </ul>
          <button
            className="lp-secondary"
            onClick={() =>
              hasAccount ? onEnter() : onAuth("register", "teacher")
            }
          >
            {t(hasAccount ? "Открыть кабинет" : "Создать аккаунт учителя")}
            {t(" ")}
            <ArrowRight size={17} />
          </button>
          <small>
            {t(
              "Выберите роль «Учитель» при регистрации и создайте свой класс.",
            )}
          </small>
        </div>
        <div
          className="lp-teacher-window"
          data-reveal
          data-loop
          data-spotlight
          aria-label={t("Пример интерфейса кабинета учителя")}
        >
          <div className="lp-window-bar">
            <span>
              <i />
              <i />
              <i />
            </span>
            <span>{t("Кабинет учителя")}</span>
            <span>{t("Пример")}</span>
          </div>
          <div className="lp-teacher-window-body">
            <div className="lp-class-title">
              <span>
                <Users size={22} />
              </span>
              <div>
                <h3>{t("Программирование · 4 «А»")}</h3>
                <p>{t("Материалы и задания класса")}</p>
              </div>
            </div>
            <div className="lp-assignment-example">
              <span>
                <BookOpen size={16} />
                {t("РАЗДЕЛ 01")}
              </span>
              <h4>{t("Команды и последовательности")}</h4>
              <p>{t("Как превратить план действий в программу?")}</p>
              <div>
                <span>{t("Теория")}</span>
                <span>{t("Практика")}</span>
                <span>{t("Результаты")}</span>
              </div>
            </div>
            <div className="lp-teacher-example-row">
              <span className="lp-mini-avatar">{t("А")}</span>
              <span>
                {t("Маршрут к флагу")}
                <small>{t("Задание для машины")}</small>
              </span>
              <span className="lp-example-status">
                <Check size={13} />
                {t("Выполнено")}
              </span>
            </div>
            <div className="lp-teacher-example-row">
              <span className="lp-mini-avatar lp-mini-alt">{t("М")}</span>
              <span>
                {t("Маршрут к флагу")}
                <small>{t("Задание для машины")}</small>
              </span>
              <span className="lp-example-status lp-in-progress">
                {t("В процессе")}
              </span>
            </div>
          </div>
        </div>
      </section>
      <section className="lp-section lp-steps-section">
        <div className="lp-section-title" data-reveal>
          <span className="lp-kicker">{t("НАЧАЛО РАБОТЫ")}</span>
          <h2>{t("Как начать обучение")}</h2>
        </div>
        <div className="lp-steps">
          {t(
            [
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
                style={
                  { "--reveal-delay": `${i * 90}ms` } as React.CSSProperties
                }
              >
                <span className="lp-step-number">0{t(i + 1)}</span>
                <step.icon size={22} />
                <h3>{t(step.title)}</h3>
                <p>{t(step.text)}</p>
              </article>
            )),
          )}
        </div>
      </section>
      <section className="lp-section lp-faq" id="faq">
        <div className="lp-section-title" data-reveal>
          <span className="lp-kicker">{t("О ПЛАТФОРМЕ")}</span>
          <h2>{t("Частые вопросы")}</h2>
        </div>
        <div className="lp-faq-list" data-reveal>
          {t(
            [
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
                    {t(question)}
                    <ChevronDown size={18} />
                  </button>
                </h3>
                <div id={`lp-faq-${i}`} hidden={faq !== i}>
                  <p>{t(answer)}</p>
                </div>
              </article>
            )),
          )}
        </div>
      </section>
      <section className="lp-final-cta" data-loop>
        <div className="lp-cta-orbit" aria-hidden="true" />
        <span className="lp-kicker">{t("ОБУЧЕНИЕ НА EASYCODE")}</span>
        <h2>
          {t("Изучайте программирование")}
          <br />
          <span>{t("на практике")}</span>
        </h2>
        <p>
          {t(
            "Учебные материалы, симулятор и работа в классе на одной платформе.",
          )}
        </p>
        <div>
          <button
            className="lp-primary"
            onClick={start}
            disabled={pendingAccount}
          >
            {t(hasAccount ? "Продолжить в кабинете" : "Начать обучение")}
            {t(" ")}
            <ArrowRight size={18} />
          </button>
          <button className="lp-text-button" onClick={onTry}>
            {t(hasAccount ? "Открыть практику" : "Открыть демоверсию")}
            {t(" ")}
            <ArrowUpRight size={17} />
          </button>
        </div>
      </section>
      <footer className="lp-footer">
        <div>
          <a
            className="lp-brand"
            href="/"
            aria-label={t("EasyCode — на главную")}
            onClick={(event) => {
              event.preventDefault();
              onCloseAuth();
            }}
          >
            EasyCode
          </a>
          <p>{t("Платформа обучения программированию")}</p>
        </div>
        <nav aria-label={t("Навигация в подвале")}>
          <a
            href="#features"
            onClick={(e) => {
              e.preventDefault();
              scrollTo("features");
            }}
          >
            {t("О платформе")}
          </a>
          <a
            href="#teachers"
            onClick={(e) => {
              e.preventDefault();
              scrollTo("teachers");
            }}
          >
            {t("Учителям")}
          </a>
          <button onClick={() => (hasAccount ? onEnter() : onAuth("login"))}>
            {t(hasAccount ? "В кабинет" : "Войти")} <ArrowUpRight size={14} />
          </button>
        </nav>
        <div className="lp-footer-bottom">
          <span>© {t(new Date().getFullYear())} EasyCode</span>
          <span>{t("Образовательная платформа")}</span>
        </div>
      </footer>
      {t(
        authMode && (
          <div className="modal-overlay lp-auth-overlay" onClick={onCloseAuth}>
            <section
              className="modal lp-auth-modal"
              role="dialog"
              aria-modal="true"
              aria-label={t(
                authMode === "login"
                  ? "Вход в EasyCode"
                  : "Регистрация в EasyCode",
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="modal-close icon-button"
                aria-label={t("Закрыть")}
                onClick={onCloseAuth}
              >
                <X size={20} />
              </button>
              <div className="auth-language-row">
                <span className="lp-auth-brand">EasyCode</span>
                <LanguageSwitcher />
              </div>
              <Suspense fallback={<p role="status">{t("Открываем форму…")}</p>}>
                <AuthPanel
                  key={`${authMode}:${initialRole}`}
                  initialMode={authMode}
                  initialRole={initialRole}
                  onModeChange={onAuth}
                  onComplete={onAuthenticated}
                  onNotice={setNotice}
                />
              </Suspense>
              {t(
                notice && (
                  <p className="lp-auth-error" role="alert">
                    {t(notice)}
                  </p>
                ),
              )}
              <button className="lp-auth-demo" onClick={onTry}>
                {t("Продолжить без входа ")}
                <ArrowRight size={14} />
              </button>
            </section>
          </div>
        ),
      )}
    </div>
  );
}
