// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import { AuthPanel } from "./AuthPanel";
import type { Profile, Role } from "../lib/types";

// Never import the configured Supabase client or make real authentication calls.
const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  updateUser: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("../lib/api", () => ({
  api: mocks.api,
  supabase: {
    auth: {
      signUp: mocks.signUp,
      signInWithPassword: mocks.signInWithPassword,
      signOut: mocks.signOut,
      updateUser: mocks.updateUser,
      getSession: mocks.getSession,
    },
  },
}));

type Props = Parameters<typeof AuthPanel>[0];
const teacher: Profile = { id: "teacher-id", name: "Марина", role: "teacher" };
const student: Profile = { id: "student-id", name: "Алишер", role: "student" };
const signedIn = (profile: Profile) => ({
  error: null,
  data: { user: { id: profile.id }, session: { user: { id: profile.id } } },
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
let root: Root;
let container: HTMLDivElement;
let onComplete: Mock<Props["onComplete"]>;
let onNotice: Mock<Props["onNotice"]>;
let onModeChange: Mock<NonNullable<Props["onModeChange"]>>;
async function render(props: Partial<Props> = {}) {
  await act(async () =>
    root.render(
      <AuthPanel
        onComplete={onComplete}
        onNotice={onNotice}
        onModeChange={onModeChange}
        {...props}
      />,
    ),
  );
}
const input = (name: string) =>
  container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
function fill() {
  input("email").value = "  learner@example.test  ";
  input("password").value = "test-password";
  if (input("name")) input("name").value = "Марина";
}
async function pick(role: Role) {
  await act(async () =>
    container
      .querySelector<HTMLInputElement>(`input[name="role"][value="${role}"]`)!
      .click(),
  );
}
async function submit() {
  await act(async () => {
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}
async function click(text: string) {
  const button = [...container.querySelectorAll("button")].find((item) =>
    item.textContent?.includes(text),
  );
  expect(button).toBeDefined();
  await act(async () => button!.click());
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.signUp.mockResolvedValue(signedIn(student));
  mocks.signInWithPassword.mockResolvedValue(signedIn(student));
  mocks.api.mockResolvedValue(student);
  mocks.getSession.mockImplementation(async () => {
    const request =
      mocks.signInWithPassword.mock.results.at(-1)?.value ??
      mocks.signUp.mock.results.at(-1)?.value;
    const result = await request;
    return { data: { session: result?.data.session ?? null }, error: null };
  });
  onComplete = vi.fn();
  onNotice = vi.fn();
  onModeChange = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("Network disabled in unit tests"))),
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AuthPanel", () => {
  it.each(["login", "register"] as const)(
    "offers labelled teacher and student choices in %s mode",
    async (initialMode) => {
      await render({ initialMode });
      const radios = [
        ...container.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
      ];
      expect(radios.map((radio) => radio.value)).toEqual([
        "student",
        "teacher",
      ]);
      expect(radios[0].checked).toBe(true);
      expect(radios[0].closest("label")?.textContent).toContain("Ученик");
      expect(radios[1].closest("label")?.textContent).toContain("Учитель");
      await pick("teacher");
      expect(radios[1].checked).toBe(true);
      expect(mocks.api).not.toHaveBeenCalled();
      expect(mocks.updateUser).not.toHaveBeenCalled();
    },
  );

  it("stores a newly selected teacher role in signup metadata and verifies the database profile", async () => {
    mocks.signUp.mockResolvedValue(signedIn(teacher));
    mocks.api.mockResolvedValue(teacher);
    await render({ initialMode: "register" });
    await pick("teacher");
    fill();
    await submit();
    expect(mocks.signUp).toHaveBeenCalledExactlyOnceWith({
      email: "learner@example.test",
      password: "test-password",
      options: { data: { name: "Марина", role: "teacher" } },
    });
    expect(mocks.api).toHaveBeenCalledExactlyOnceWith("/me", undefined, {
      expectedUserId: teacher.id,
    });
    expect(onComplete).toHaveBeenCalledExactlyOnceWith(teacher);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("stores the student role for a default student registration", async () => {
    await render({ initialMode: "register" });
    fill();
    await submit();
    expect(mocks.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: { data: { name: "Марина", role: "student" } },
      }),
    );
    expect(onComplete).toHaveBeenCalledExactlyOnceWith(student);
  });

  it("waits for email confirmation without reading an unauthenticated profile", async () => {
    mocks.signUp.mockResolvedValue({
      error: null,
      data: { user: { id: teacher.id }, session: null },
    });
    await render({ initialMode: "register", initialRole: "teacher" });
    fill();
    await submit();
    expect(container.textContent).toContain("Проверьте почту");
    expect(container.textContent).toContain("войдите как учитель");
    expect(mocks.api).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    await click("Перейти ко входу");
    expect(onModeChange).toHaveBeenLastCalledWith("login", "teacher");
    expect(
      container.querySelector<HTMLInputElement>('input[value="teacher"]')
        ?.checked,
    ).toBe(true);
  });

  it("uses login selection only for validation, never as a login grant or profile update", async () => {
    mocks.signInWithPassword.mockResolvedValue(signedIn(teacher));
    mocks.api.mockResolvedValue(teacher);
    await render({ initialRole: "teacher" });
    fill();
    await submit();
    expect(mocks.signInWithPassword).toHaveBeenCalledExactlyOnceWith({
      email: "learner@example.test",
      password: "test-password",
    });
    expect(mocks.api).toHaveBeenCalledExactlyOnceWith("/me", undefined, {
      expectedUserId: teacher.id,
    });
    expect(onComplete).toHaveBeenCalledExactlyOnceWith(teacher);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it.each([
    {
      selected: "teacher" as const,
      stored: student,
      button: "Продолжить как ученик",
    },
    {
      selected: "student" as const,
      stored: teacher,
      button: "Перейти в кабинет учителя",
    },
  ])(
    "continues with the stored $stored.role role when $selected was chosen",
    async ({ selected, stored, button }) => {
      mocks.signInWithPassword.mockResolvedValue(signedIn(stored));
      mocks.api.mockResolvedValue(stored);
      await render({ initialRole: selected });
      fill();
      await submit();
      expect(container.textContent).toContain(
        "Выбор на форме не изменяет права доступа",
      );
      expect(onComplete).not.toHaveBeenCalled();
      expect(mocks.updateUser).not.toHaveBeenCalled();
      expect(mocks.signOut).not.toHaveBeenCalled();
      await click(button);
      expect(onComplete).toHaveBeenCalledExactlyOnceWith(stored);
    },
  );

  it("explains an unapplied teacher-signup migration without pretending to grant teacher access", async () => {
    await render({ initialMode: "register", initialRole: "teacher" });
    fill();
    await submit();
    expect(container.textContent).toContain("202610070002_signup_roles.sql");
    expect(onComplete).not.toHaveBeenCalled();
    await click("Продолжить как ученик");
    expect(onComplete).toHaveBeenCalledExactlyOnceWith(student);
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("retries only profile verification after a successful login and failed profile load", async () => {
    mocks.api
      .mockRejectedValueOnce(new Error("Профиль ещё не создан"))
      .mockResolvedValueOnce(student);
    await render();
    fill();
    await submit();
    expect(container.textContent).toContain("Повторная регистрация не нужна");
    expect(onNotice).toHaveBeenLastCalledWith("Профиль ещё не создан");
    expect(onComplete).not.toHaveBeenCalled();
    await click("Повторить проверку");
    expect(mocks.signInWithPassword).toHaveBeenCalledTimes(1);
    expect(mocks.api).toHaveBeenCalledTimes(2);
    expect(mocks.api).toHaveBeenLastCalledWith("/me", undefined, {
      expectedUserId: student.id,
    });
    expect(onComplete).toHaveBeenCalledExactlyOnceWith(student);
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("freezes the chosen role and auth mode while a request is pending", async () => {
    const request = deferred<ReturnType<typeof signedIn>>();
    mocks.signUp.mockReturnValue(request.promise);
    await render({ initialMode: "register", initialRole: "teacher" });
    fill();
    await submit();
    expect(container.querySelector("fieldset")?.disabled).toBe(true);
    expect(input("email").disabled).toBe(true);
    expect(
      container.querySelector<HTMLButtonElement>(".auth-switch")?.disabled,
    ).toBe(true);
    await act(async () => request.resolve(signedIn(student)));
    expect(container.textContent).toContain("РОЛЬ АККАУНТА");
  });

  it("shows authentication failures without calling /me or completing login", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      error: new Error("Неверный пароль"),
      data: { user: null, session: null },
    });
    await render();
    fill();
    await submit();
    expect(onNotice).toHaveBeenLastCalledWith("Неверный пароль");
    expect(mocks.api).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    expect(input("email").disabled).toBe(false);
  });

  it("keeps the teacher choice when moving from login to registration", async () => {
    await render();
    await pick("teacher");
    await click("Нет аккаунта? Зарегистрироваться");
    expect(onModeChange).toHaveBeenLastCalledWith("register", "teacher");
    expect(
      container.querySelector<HTMLInputElement>('input[value="teacher"]')
        ?.checked,
    ).toBe(true);
    expect(input("name")).toBeTruthy();
  });

  it("ignores a completed authentication request after the form unmounts", async () => {
    const request = deferred<ReturnType<typeof signedIn>>();
    mocks.signInWithPassword.mockReturnValue(request.promise);
    await render();
    fill();
    await submit();
    await act(async () => root.unmount());
    root = createRoot(container);
    const notices = onNotice.mock.calls.length;
    await act(async () => request.resolve(signedIn(student)));
    expect(mocks.api).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    expect(onNotice).toHaveBeenCalledTimes(notices);
  });

  it("ignores a late profile after closing the form", async () => {
    const request = deferred<Profile>();
    mocks.api.mockReturnValue(request.promise);
    await render();
    fill();
    await submit();
    expect(mocks.api).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
    root = createRoot(container);
    const notices = onNotice.mock.calls.length;
    await act(async () => request.resolve(student));
    expect(onComplete).not.toHaveBeenCalled();
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(onNotice).toHaveBeenCalledTimes(notices);
  });

  it.each([teacher.id, null])(
    "rejects a late profile when the current session changes to %s",
    async (nextId) => {
      const request = deferred<Profile>();
      mocks.api.mockReturnValue(request.promise);
      await render();
      fill();
      await submit();
      mocks.getSession.mockResolvedValue({
        data: { session: nextId ? { user: { id: nextId } } : null },
        error: null,
      });
      await act(async () => request.resolve(student));
      expect(onComplete).not.toHaveBeenCalled();
      expect(onNotice).toHaveBeenLastCalledWith(
        "Аккаунт изменился. Открой форму входа заново.",
      );
      expect(container.querySelector("form")).not.toBeNull();
      expect(mocks.updateUser).not.toHaveBeenCalled();
    },
  );

  it("rejects a profile belonging to another user even if the expected session remains active", async () => {
    mocks.api.mockResolvedValue(teacher);
    await render();
    fill();
    await submit();
    expect(onComplete).not.toHaveBeenCalled();
    expect(onNotice).toHaveBeenLastCalledWith(
      "Аккаунт изменился. Открой форму входа заново.",
    );
    expect(container.textContent).not.toContain("РОЛЬ АККАУНТА");
  });

  it("rechecks session identity before continuing from a role mismatch", async () => {
    await render({ initialRole: "teacher" });
    fill();
    await submit();
    expect(container.textContent).toContain("РОЛЬ АККАУНТА");
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: teacher.id } } },
      error: null,
    });
    await click("Продолжить как ученик");
    expect(mocks.api).toHaveBeenCalledTimes(2);
    expect(onComplete).not.toHaveBeenCalled();
    expect(onNotice).toHaveBeenLastCalledWith(
      "Аккаунт изменился. Открой форму входа заново.",
    );
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
});
