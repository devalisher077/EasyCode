import { t, useLanguage } from "./lib/i18n";
import { lazy, Suspense, useEffect, useState } from "react";
import {
  BookOpen,
  CircuitBoard,
  ChevronRight,
  GraduationCap,
  Menu,
  Search,
  Terminal,
  Users,
  X,
  LogOut,
} from "lucide-react";
import { api, ApiError, downloadMaterial, supabase } from "./lib/api";
import type { Catalog, Material, Role, Task } from "./lib/types";
import type { Account } from "./lib/useAccount";
import { Course } from "./components/Course";
import { Practice } from "./components/Practice";
import { Classroom } from "./components/Classroom";
import { AuthPanel } from "./components/AuthPanel";
import { LanguageSwitcher } from "./components/LanguageSwitcher";
import { useDialog } from "./lib/useDialog";
import { LessonPage } from "./components/LessonPage";
import { useLessonProgress } from "./lib/useLessonProgress";
import "./components/electronics.css";

const Electronics = lazy(() => import("./components/Electronics"));

const PresentationViewer = lazy(() =>
  import("./components/PresentationViewer").then((module) => ({
    default: module.PresentationViewer,
  })),
);

type Page = "course" | "practice" | "classroom" | "lesson";
export default function App({
  account,
  onHome = () => window.location.assign("/"),
  route = window.location.pathname + window.location.search,
  onNavigate = (path: string) => window.location.assign(path),
}: {
  account: Account;
  onHome?: () => void;
  route?: string;
  onNavigate?: (path: string) => void;
}) {
  const routePath = route.split("?")[0];
  const language = useLanguage();
  const routeQuery = new URLSearchParams(route.split("?")[1]);
  const lessonId = routePath.startsWith("/learn/topic/")
    ? routePath.slice("/learn/topic/".length)
    : null;
  const page: Page =
    lessonId !== null
      ? "lesson"
      : routeQuery.get("practice") === "1"
        ? "practice"
        : routeQuery.get("view") === "classroom"
          ? "classroom"
          : "course";
  const { mode, profile, ready: identityReady } = account;
  const role = profile?.role ?? "student";
  const name = profile?.name ?? t("Гость");
  const userId = profile?.id ?? "";
  const signedIn = Boolean(profile);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authFormActive, setAuthFormActive] = useState(false);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedPresentation, setSelectedPresentation] = useState<{
    material: Material;
    ownerId: string;
    role: Role;
    mode: Account["mode"];
    route: string;
  }>();
  const canViewPresentation =
    identityReady &&
    !account.error &&
    (mode === "demo" ||
      (signedIn && mode === "supabase" && account.sessionUserId === userId)) &&
    !authOpen;
  const presentation =
    canViewPresentation &&
    selectedPresentation?.ownerId === userId &&
    selectedPresentation.role === role &&
    selectedPresentation.mode === mode &&
    selectedPresentation.route === route
      ? selectedPresentation
      : undefined;
  const [selectedTask, setSelectedTask] = useState<{
    ownerId: string;
    task: Task;
  }>();
  const task = selectedTask?.ownerId === userId ? selectedTask.task : undefined;
  const [mobileMenu, setMobileMenu] = useState(false);
  const learning = useLessonProgress({
    ownerId: userId || "guest",
    cloud: signedIn || mode === "demo",
    demo: mode === "demo",
    enabled: identityReady && !account.error,
  });
  useEffect(() => {
    if (page !== "lesson")
      document.title = t("EasyCode — учебное пространство");
  }, [page, language]);
  useEffect(() => {
    // A previously opened deck must not reappear when returning to an account,
    // role or route after its protected viewer has been dismissed.
    setSelectedPresentation((previous) =>
      previous &&
      (!canViewPresentation ||
        previous.ownerId !== userId ||
        previous.role !== role ||
        previous.mode !== mode ||
        previous.route !== route)
        ? undefined
        : previous,
    );
  }, [canViewPresentation, userId, role, mode, route]);
  useDialog(authOpen, () => {
    setAuthOpen(false);
  });
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (
        event.key === "/" &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement)
      ) {
        const search =
          document.querySelector<HTMLInputElement>(".search input");
        if (search) {
          event.preventDefault();
          search.focus();
        }
      }
    };
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, []);
  useEffect(() => {
    setCatalog(null);
    if (!mode || !identityReady || account.error) return;
    let current = true;
    api<Catalog>("/catalog")
      .then((data) => {
        if (current) setCatalog(data);
      })
      .catch((e) => {
        if (current) {
          if (e instanceof ApiError && [401, 403].includes(e.status)) {
            setCatalog(null);
            return;
          }
          setNotice(e.message);
        }
      });
    return () => {
      current = false;
    };
  }, [mode, userId, role, identityReady, account.error]);
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(""), 6500);
      return () => clearTimeout(timer);
    }
  }, [notice]);
  function navigate(next: Exclude<Page, "lesson">) {
    setSelectedPresentation(undefined);
    onNavigate(
      next === "practice"
        ? "/learn?practice=1"
        : next === "classroom"
          ? "/learn?view=classroom"
          : "/learn",
    );
    setMobileMenu(false);
    setQuery("");
  }
  function changeRole(next: Role) {
    setSelectedPresentation(undefined);
    account.changeDemoRole(next);
    setSelectedTask(undefined);
  }
  function openAccount() {
    setSelectedPresentation(undefined);
    setAuthFormActive(!signedIn);
    setAuthOpen(true);
  }
  function openPractice(selected?: Task) {
    setSelectedTask(selected ? { ownerId: userId, task: selected } : undefined);
    navigate("practice");
  }
  function canOpenMaterial() {
    if (
      !identityReady ||
      (mode === "supabase" && signedIn && account.sessionUserId !== userId)
    ) {
      setNotice(
        "Проверяется доступ к материалам. Повторите попытку после загрузки аккаунта.",
      );
      return false;
    }
    if (account.error) {
      setNotice(account.error);
      return false;
    }
    if (!signedIn && mode !== "demo") {
      openAccount();
      return false;
    }
    return !authOpen;
  }
  function openPresentation(material: Material) {
    if (!canOpenMaterial()) return;
    setSelectedPresentation({ material, ownerId: userId, role, mode, route });
  }
  function downloadLessonMaterial(material: Material) {
    if (!canOpenMaterial()) return;
    downloadMaterial(material.path).catch((error) =>
      setNotice(
        error instanceof Error ? error.message : "Не удалось скачать материал.",
      ),
    );
  }
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? "is-open" : ""}`}>
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            setSelectedPresentation(undefined);
            onHome();
          }}
          aria-label={t("EasyCode, главная")}
        >
          easycode
        </a>
        <div className="workspace-label">
          <span className="workspace-icon">
            <GraduationCap size={18} />
          </span>
          <div>
            {t("Учебная платформа")}
            <small>{t("Основы программирования")}</small>
          </div>
        </div>
        <div className="nav-label">{t("ОБУЧЕНИЕ")}</div>
        <nav aria-label={t("Главное меню")}>
          <button
            className={
              page === "course" || page === "lesson"
                ? "nav-item active"
                : "nav-item"
            }
            onClick={() => navigate("course")}
          >
            <BookOpen size={18} />
            {t("Мой курс")}
            <span className="nav-count">6</span>
          </button>
          <button
            className={page === "practice" ? "nav-item active" : "nav-item"}
            onClick={() => openPractice()}
          >
            <Terminal size={18} />
            {t("Практическая среда")}
            <span className="tiny-dot" />
          </button>
          <button
            className={page === "classroom" ? "nav-item active" : "nav-item"}
            onClick={() => navigate("classroom")}
          >
            <Users size={18} />
            {t(role === "teacher" ? "Кабинет учителя" : "Мой класс")}
          </button>
        </nav>
        <div className="sidebar-bottom">
          <span className="version">
            EasyCode <span>{t("версия 0.1")}</span>
          </span>
        </div>
      </aside>
      {t(
        mobileMenu && (
          <button
            className="sidebar-scrim"
            aria-label={t("Закрыть меню")}
            onClick={() => setMobileMenu(false)}
          />
        ),
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-toggle"
              aria-label={t("Открыть меню")}
              onClick={() => setMobileMenu(true)}
            >
              <Menu size={20} />
            </button>
            <span>{t("Платформа")}</span>
            <ChevronRight size={14} />
            <strong>
              {t(
                page === "course"
                  ? "Мой курс"
                  : page === "lesson"
                    ? `Тема ${lessonId}`
                    : page === "practice"
                      ? "Практическая среда"
                      : role === "teacher"
                        ? "Кабинет учителя"
                        : "Мой класс",
              )}
            </strong>
          </div>
          <div className="header-actions">
            <LanguageSwitcher />
            {t(
              page === "course" && (
                <label className="search">
                  <Search size={16} />
                  <input
                    aria-label={t("Найти тему")}
                    placeholder={t("Найти тему...")}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <kbd>/</kbd>
                </label>
              ),
            )}
            <span className="edition">{t("3–6 класс")}</span>
            {t(
              signedIn && (
                <button className="account-label" onClick={openAccount}>
                  <strong>{name}</strong>
                  <span>{t(role === "teacher" ? "Учитель" : "Ученик")}</span>
                </button>
              ),
            )}
            <button
              className="avatar"
              title={signedIn ? name : t("Войти")}
              onClick={openAccount}
            >
              {t(
                signedIn ? name.slice(0, 1).toUpperCase() : <Users size={16} />,
              )}
            </button>
          </div>
        </header>
        {t(
          mode === "demo" && (
            <div className="demo-bar">
              <span>
                <span className="status-dot" />
                {t("Локальный деморежим")}
                {t(" ")}
                <span className="demo-explainer">
                  {t("· данные сбросятся при перезапуске сервера")}
                </span>
              </span>
              <label>
                {t("Смотреть как")}
                <select
                  aria-label={t("Роль в деморежиме")}
                  value={role}
                  onChange={(e) => changeRole(e.target.value as Role)}
                >
                  <option value="student">{t("Ученик")}</option>
                  <option value="teacher">{t("Учитель")}</option>
                </select>
              </label>
            </div>
          ),
        )}
        {t(
          account.error && (
            <div className="demo-bar" role="alert">
              <span>{t(account.error)}</span>
              <button className="text-button" onClick={account.refresh}>
                {t("Повторить")}
              </button>
            </div>
          ),
        )}
        {t(
          mode === "supabase" &&
            identityReady &&
            !account.sessionUserId &&
            !signedIn && (
              <div className="demo-bar">
                <span>
                  {t("Для классов и сохранения результатов нужен вход.")}
                </span>
                <button className="text-button" onClick={openAccount}>
                  {t("Войти в аккаунт ")}
                  <ChevronRight size={14} />
                </button>
              </div>
            ),
        )}
        <main key={`${userId}-${role}-${page}`}>
          {t(
            page === "course" && (
              <Course
                catalog={catalog}
                query={query}
                onTopic={(selected) =>
                  onNavigate(`/learn/topic/${selected.number}`)
                }
                onPractice={() => openPractice()}
                progress={learning.progress}
                storage={learning.storage}
                storageError={learning.error}
              />
            ),
          )}
          {t(
            page === "lesson" && (
              <LessonPage
                key={lessonId}
                lessonId={lessonId!}
                progress={learning.progress[lessonId!]}
                storage={learning.storage}
                storageError={learning.error}
                onReadStep={learning.markStep}
                onCheckQuiz={learning.checkQuiz}
                onBack={() => navigate("course")}
                onNavigateLesson={(id) => onNavigate(`/learn/topic/${id}`)}
                onPractice={() =>
                  lessonId?.startsWith("5.")
                    ? onNavigate(
                        `/learn?practice=1&environment=electronics&lesson=${lessonId}`,
                      )
                    : (() => {
                        setSelectedTask(undefined);
                        onNavigate(`/learn?practice=1&lesson=${lessonId}`);
                      })()
                }
                onSignIn={openAccount}
                materials={
                  catalog?.sections
                    .flatMap((section) => section.topics)
                    .find((item) => item.number === lessonId)?.materials || []
                }
                onPreview={openPresentation}
                onDownload={downloadLessonMaterial}
              />
            ),
          )}
          {t(
            page === "practice" && (
              <>
                <nav
                  className="practice-environments"
                  aria-label={t("Практические среды")}
                >
                  <button
                    aria-pressed={
                      routeQuery.get("environment") !== "electronics"
                    }
                    onClick={() => onNavigate("/learn?practice=1")}
                  >
                    <Terminal size={17} />
                    {t("Карта и машина")}
                  </button>
                  <button
                    aria-pressed={
                      routeQuery.get("environment") === "electronics"
                    }
                    onClick={() =>
                      onNavigate("/learn?practice=1&environment=electronics")
                    }
                  >
                    <CircuitBoard size={17} />
                    {t("Электроника")}
                  </button>
                </nav>
                {t(
                  routeQuery.get("environment") === "electronics" ? (
                    <Suspense
                      fallback={
                        <div className="empty-state">
                          {t("Загружаем лабораторию…")}
                        </div>
                      }
                    >
                      <Electronics
                        key={`${userId || "guest"}:${routeQuery.get("lesson") || ""}`}
                        draftOwner={userId || "guest"}
                        onNotice={setNotice}
                        canUseCloud={signedIn || mode === "demo"}
                        lessonId={
                          /^5\.[12]$/.test(routeQuery.get("lesson") || "")
                            ? routeQuery.get("lesson")!
                            : undefined
                        }
                      />
                    </Suspense>
                  ) : (
                    <Practice
                      key={`${userId}:${task?.id || "intro-route"}:${routeQuery.get("lesson") || ""}`}
                      draftOwner={userId || "guest"}
                      initialTask={task}
                      onNotice={setNotice}
                      canUseCloud={signedIn || mode === "demo"}
                      onRequireAuth={openAccount}
                      onChooseLesson={(id) => {
                        setSelectedTask(undefined);
                        onNavigate(
                          `/learn?practice=1${id ? `&lesson=${id}` : ""}`,
                        );
                      }}
                      lessonId={
                        /^[1-6]\.[12]$/.test(routeQuery.get("lesson") || "")
                          ? routeQuery.get("lesson")!
                          : undefined
                      }
                    />
                  ),
                )}
              </>
            ),
          )}
          {t(
            page === "classroom" && !identityReady && (
              <div className="empty-state">{t("Загружаем кабинет…")}</div>
            ),
          )}
          {t(
            page === "classroom" && identityReady && !signedIn && (
              <div className="large-empty">
                <h2>{t("Личный кабинет")}</h2>
                <p>
                  {t(
                    "Войдите как учитель для управления классами и уроками или как ученик для доступа к заданиям своего класса.",
                  )}
                </p>
                <button className="primary-button" onClick={openAccount}>
                  {t("Войти в аккаунт")}
                </button>
              </div>
            ),
          )}
          {t(
            page === "classroom" && identityReady && signedIn && (
              <Classroom
                key={userId}
                ownerId={userId}
                onPreview={openPresentation}
                role={role}
                onNotice={setNotice}
                onPractice={openPractice}
              />
            ),
          )}
        </main>
        <footer>
          <span>{t("EasyCode · Образовательная платформа")}</span>
          <span>{t("Основы программирования")}</span>
        </footer>
      </div>
      {t(
        notice && (
          <div className="toast" role="status">
            {t(notice)}
            <button
              className="icon-button"
              aria-label={t("Закрыть уведомление")}
              onClick={() => setNotice("")}
            >
              <X size={16} />
            </button>
          </div>
        ),
      )}
      {presentation && (
        <Suspense
          fallback={
            <div className="toast" role="status">
              {t("Загрузка просмотра презентации…")}
              <button
                className="text-button"
                onClick={() => setSelectedPresentation(undefined)}
              >
                {t("Отменить")}
              </button>
            </div>
          }
        >
          <PresentationViewer
            key={`${presentation.ownerId}:${presentation.role}:${presentation.material.path}`}
            material={presentation.material}
            ownerId={presentation.ownerId}
            demo={mode === "demo"}
            onClose={() => setSelectedPresentation(undefined)}
            onDownload={() => downloadLessonMaterial(presentation.material)}
          />
        </Suspense>
      )}
      {t(
        authOpen && (
          <div className="modal-overlay" onClick={() => setAuthOpen(false)}>
            <section
              className="modal"
              role="dialog"
              aria-modal="true"
              aria-label={t("Аккаунт")}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="auth-language-row">
                <LanguageSwitcher />
              </div>
              <button
                className="modal-close icon-button"
                aria-label={t("Закрыть")}
                onClick={() => setAuthOpen(false)}
              >
                <X size={20} />
              </button>
              {t(
                mode === "demo" ? (
                  <>
                    <h2>{t("Демонстрационный режим")}</h2>
                    <p>
                      {t(
                        "В меню сверху можно переключиться между учеником и учителем. Для настоящих аккаунтов заполните настройки Supabase в файле .env.",
                      )}
                    </p>
                    <button
                      className="primary-button"
                      onClick={() => setAuthOpen(false)}
                    >
                      {t("Понятно")}
                    </button>
                  </>
                ) : signedIn && !authFormActive ? (
                  <>
                    <h2>{name}</h2>
                    <p>
                      {t(
                        role === "teacher"
                          ? "Кабинет учителя"
                          : "Аккаунт ученика",
                      )}
                    </p>
                    <button
                      className="primary-button"
                      onClick={() => {
                        setAuthOpen(false);
                        navigate("classroom");
                      }}
                    >
                      <Users size={16} />
                      {t(
                        role === "teacher"
                          ? "Открыть кабинет учителя"
                          : "Открыть мой класс",
                      )}
                    </button>
                    <button
                      className="secondary-button account-signout"
                      onClick={async () => {
                        const result = await supabase?.auth.signOut({
                          scope: "local",
                        });
                        if (result?.error) {
                          setNotice("Не удалось выйти. Повторите попытку.");
                          return;
                        }
                        setAuthOpen(false);
                      }}
                    >
                      <LogOut size={16} />
                      {t("Выйти")}
                    </button>
                  </>
                ) : (
                  <AuthPanel
                    onComplete={(user) => {
                      setAuthOpen(false);
                      account.refresh();
                      if (user.role === "teacher") navigate("classroom");
                    }}
                    onNotice={setNotice}
                  />
                ),
              )}
            </section>
          </div>
        ),
      )}
    </div>
  );
}
