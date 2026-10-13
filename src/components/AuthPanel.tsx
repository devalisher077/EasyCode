import { t } from "../lib/i18n";
import { useEffect, useRef, useState } from "react";
import { BookOpen, GraduationCap } from "lucide-react";
import { api, supabase } from "../lib/api";
import type { Profile, Role } from "../lib/types";
import "./auth.css";
export function AuthPanel({
  onComplete,
  onNotice,
  initialMode = "login",
  initialRole = "student",
  onModeChange,
}: {
  onComplete: (profile: Profile) => void;
  onNotice: (message: string) => void;
  initialMode?: "login" | "register";
  initialRole?: Role;
  onModeChange?: (mode: "login" | "register", role: Role) => void;
}) {
  const [register, setRegister] = useState(initialMode === "register");
  const [role, setRole] = useState<Role>(initialRole);
  const [busy, setBusy] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [mismatch, setMismatch] = useState<Profile | null>(null);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const mounted = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
    };
  }, []);
  const current = (attempt: number) =>
    mounted.current && generation.current === attempt;
  async function verifyProfile(
    userId: string,
    attempt: number,
    acceptStoredRole = false,
  ) {
    const profile = await api<Profile>("/me", undefined, {
      expectedUserId: userId,
    });
    if (!current(attempt)) return;
    // expectedUserId protects request dispatch. Re-check after the response too:
    // another tab may have changed or ended the session while /me was loading.
    const session = await supabase?.auth.getSession();
    if (!current(attempt)) return;
    if (session?.error) throw session.error;
    if (profile.id !== userId || session?.data.session?.user.id !== userId) {
      setMismatch(null);
      setPendingUserId(null);
      throw new Error("Аккаунт изменился. Открой форму входа заново.");
    }
    setPendingUserId(null);
    if (!acceptStoredRole && profile.role !== role) setMismatch(profile);
    else onComplete(profile);
  }
  function changeMode(mode: "login" | "register") {
    generation.current++;
    setConfirmationSent(false);
    setRegister(mode === "register");
    onNotice("");
    onModeChange?.(mode, role);
  }
  if (mismatch)
    return (
      <>
        <span className="eyebrow">{t("РОЛЬ АККАУНТА")}</span>
        <h2>
          {t(
            mismatch.role === "teacher" ? "Аккаунт учителя" : "Аккаунт ученика",
          )}
        </h2>
        <p role="status">
          {t(
            register
              ? "Регистрация прошла, но сохранённая в базе роль отличается от выбранной. Для регистрации учителей администратору проекта нужно применить миграцию 202610070002_signup_roles.sql. Уже созданному аккаунту роль меняют отдельно."
              : "Вход выполнен. В базе у этого аккаунта другая роль. Выбор на форме не изменяет права доступа.",
          )}
        </p>
        <button
          className="primary-button"
          disabled={busy}
          onClick={async () => {
            const attempt = ++generation.current;
            setBusy(true);
            onNotice("");
            try {
              await verifyProfile(mismatch.id, attempt, true);
            } catch (error) {
              if (current(attempt))
                onNotice(
                  error instanceof Error
                    ? error.message
                    : "Не удалось проверить профиль",
                );
            } finally {
              if (current(attempt)) setBusy(false);
            }
          }}
        >
          {t(
            mismatch.role === "teacher"
              ? "Перейти в кабинет учителя"
              : "Продолжить как ученик",
          )}
        </button>
      </>
    );
  if (pendingUserId)
    return (
      <>
        <h2>{t("Проверяем профиль")}</h2>
        <p>
          {t(
            "Вход выполнен, но профиль пока не удалось загрузить. Повторная регистрация не нужна.",
          )}
        </p>
        <button
          className="primary-button"
          disabled={busy}
          onClick={async () => {
            const attempt = ++generation.current;
            setBusy(true);
            onNotice("");
            try {
              await verifyProfile(pendingUserId, attempt);
            } catch (error) {
              if (current(attempt))
                onNotice(
                  error instanceof Error
                    ? error.message
                    : "Не удалось проверить профиль",
                );
            } finally {
              if (current(attempt)) setBusy(false);
            }
          }}
        >
          {t(busy ? "Подождите…" : "Повторить проверку")}
        </button>
      </>
    );
  if (confirmationSent)
    return (
      <>
        <span className="eyebrow">{t("ПОДТВЕРЖДЕНИЕ РЕГИСТРАЦИИ")}</span>
        <h2>{t("Проверьте почту")}</h2>
        <p>
          {t(
            "Если регистрация доступна для этого адреса, на почту придёт ссылка подтверждения. Откройте её, затем вернитесь и войдите как",
          )}
          {t(" ")}
          {t(role === "teacher" ? "учитель" : "ученик")}.
        </p>
        <button className="primary-button" onClick={() => changeMode("login")}>
          {t("Перейти ко входу")}
        </button>
      </>
    );
  return (
    <>
      <span className="eyebrow">{t("УЧЁТНАЯ ЗАПИСЬ")}</span>
      <h2>{t(register ? "Создать аккаунт" : "Вход в аккаунт")}</h2>
      <p>
        {t(
          register
            ? "Выберите роль для работы с платформой. Она сохранится в профиле аккаунта."
            : "Выберите роль, указанную при регистрации, и войдите в личный кабинет.",
        )}
      </p>
      <form
        className="stack-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!supabase) {
            onNotice("Сначала добавь публичные настройки Supabase в .env.");
            return;
          }
          if (busy) return;
          const attempt = ++generation.current;
          setBusy(true);
          onNotice("");
          const data = new FormData(e.currentTarget);
          const email = String(data.get("email")).trim();
          const password = String(data.get("password"));
          try {
            const result = register
              ? await supabase.auth.signUp({
                  email,
                  password,
                  options: {
                    data: {
                      name: String(
                        data.get("name") ||
                          (role === "teacher" ? "Учитель" : "Ученик"),
                      ).trim(),
                      role,
                    },
                  },
                })
              : await supabase.auth.signInWithPassword({ email, password });
            if (!current(attempt)) return;
            if (result.error) throw result.error;
            if (register && !result.data.session) {
              setConfirmationSent(true);
              return;
            }
            if (!result.data.user || !result.data.session)
              throw new Error(
                "Не удалось открыть сессию. Попробуй войти снова.",
              );
            setPendingUserId(result.data.user.id);
            await verifyProfile(result.data.user.id, attempt);
          } catch (error) {
            if (current(attempt))
              onNotice(error instanceof Error ? error.message : "Ошибка входа");
          } finally {
            if (current(attempt)) setBusy(false);
          }
        }}
      >
        <fieldset className="auth-role-picker" disabled={busy}>
          <legend>{t(register ? "Я регистрируюсь как" : "Я вхожу как")}</legend>
          <div className="auth-role-options">
            {t(
              (["student", "teacher"] as const).map((option) => (
                <label
                  key={option}
                  className={
                    role === option ? "auth-role selected" : "auth-role"
                  }
                >
                  <input
                    type="radio"
                    name="role"
                    value={option}
                    checked={role === option}
                    onChange={() => {
                      generation.current++;
                      setRole(option);
                    }}
                  />
                  {t(
                    option === "teacher" ? (
                      <BookOpen size={20} />
                    ) : (
                      <GraduationCap size={20} />
                    ),
                  )}
                  <strong>
                    {t(option === "teacher" ? "Учитель" : "Ученик")}
                  </strong>
                  <span>
                    {t(
                      option === "teacher"
                        ? "Классы, уроки и результаты"
                        : "Обучение и задания",
                    )}
                  </span>
                </label>
              )),
            )}
          </div>
        </fieldset>
        {t(
          register && (
            <label>
              {t("Имя")}
              <input
                name="name"
                required
                maxLength={60}
                autoComplete="given-name"
                disabled={busy}
              />
            </label>
          ),
        )}
        <label>
          {t("Электронная почта")}
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            disabled={busy}
          />
        </label>
        <label>
          {t("Пароль")}
          <input
            name="password"
            type="password"
            required
            minLength={8}
            disabled={busy}
            autoComplete={register ? "new-password" : "current-password"}
          />
        </label>
        <button disabled={busy} className="primary-button">
          {t(busy ? "Подождите…" : register ? "Зарегистрироваться" : "Войти")}
        </button>
      </form>
      <button
        className="text-button auth-switch"
        disabled={busy}
        onClick={() => changeMode(register ? "login" : "register")}
      >
        {t(
          register
            ? "Уже есть аккаунт? Войти"
            : "Нет аккаунта? Зарегистрироваться",
        )}
      </button>
    </>
  );
}
