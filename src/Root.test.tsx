// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root as ReactRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Root from "./Root";
import type { Account } from "./lib/useAccount";
import type { Profile, Role } from "./lib/types";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  setDemoRole: vi.fn(),
  onAuthStateChange: vi.fn(),
  unsubscribe: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("./lib/api", () => ({
  api: mocks.api,
  setDemoRole: mocks.setDemoRole,
  supabase: {
    auth: {
      onAuthStateChange: mocks.onAuthStateChange,
      signOut: mocks.signOut,
    },
  },
}));
// Keep the real Root and account hook; replace only heavy page renderers. The
// buttons invoke the same router callbacks as each page's actual navigation.
vi.mock("./App", () => ({
  default: ({
    account,
    onHome,
    route,
  }: {
    account: Account;
    onHome: () => void;
    route: string;
  }) => (
    <main data-page="workspace" data-route={route}>
      <button onClick={onHome}>EasyCode — главная</button>
      <span data-profile>{account.profile?.id}</span>
    </main>
  ),
}));
vi.mock("./components/LandingPage", () => ({
  LandingPage: ({
    account,
    onEnter,
    authMode,
    initialRole,
    onAuth,
  }: {
    account: Account;
    onEnter: () => void;
    authMode: "login" | "register" | null;
    initialRole: Role;
    onAuth: (mode: "login" | "register", role?: Role) => void;
  }) => (
    <main
      data-page="landing"
      data-auth-mode={authMode ?? "none"}
      data-auth-role={initialRole}
    >
      <span data-profile>{account.profile?.id}</span>
      <button onClick={onEnter}>
        {account.profile?.role === "teacher" ? "Кабинет учителя" : "В кабинет"}
      </button>
      <button onClick={() => onAuth("register", "teacher")}>
        Регистрация учителя
      </button>
    </main>
  ),
}));

const teacher: Profile = { id: "teacher-id", name: "Марина", role: "teacher" };
const student: Profile = { id: "student-id", name: "Алишер", role: "student" };
let profile: Profile | null;
let root: ReactRoot;
let container: HTMLDivElement;
async function render() {
  await act(async () => root.render(<Root />));
}
async function click(text: string) {
  const button = [...container.querySelectorAll("button")].find(
    (item) => item.textContent === text,
  );
  expect(button).toBeDefined();
  await act(async () => button!.click());
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  for (const mock of Object.values(mocks)) mock.mockReset();
  profile = teacher;
  window.history.replaceState({}, "", "/learn");
  mocks.onAuthStateChange.mockImplementation(
    (
      callback: (
        event: string,
        session: { user: { id: string } } | null,
      ) => void,
    ) => {
      queueMicrotask(() =>
        callback(
          "INITIAL_SESSION",
          profile ? { user: { id: profile.id } } : null,
        ),
      );
      return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
    },
  );
  mocks.api.mockImplementation((path: string) => {
    if (path === "/health") return Promise.resolve({ mode: "supabase" });
    if (path === "/me") return Promise.resolve(profile);
    return Promise.reject(new Error(`Unexpected request: ${path}`));
  });
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
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

describe("Root account navigation", () => {
  it("keeps the teacher signed in through EasyCode → landing → teacher cabinet", async () => {
    await render();
    expect(container.querySelector("[data-profile]")?.textContent).toBe(
      teacher.id,
    );
    await click("EasyCode — главная");
    expect(window.location.pathname).toBe("/");
    expect(container.querySelector("main")?.dataset.page).toBe("landing");
    expect(container.querySelector("[data-profile]")?.textContent).toBe(
      teacher.id,
    );
    expect(mocks.unsubscribe).not.toHaveBeenCalled();
    await click("Кабинет учителя");
    expect(window.location.pathname + window.location.search).toBe(
      "/learn?view=classroom",
    );
    expect(container.querySelector("[data-profile]")?.textContent).toBe(
      teacher.id,
    );
    expect(mocks.onAuthStateChange).toHaveBeenCalledTimes(1);
    expect(mocks.api.mock.calls.map(([path]) => path)).toEqual([
      "/health",
      "/me",
    ]);
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("returns the student to their course without losing the account", async () => {
    profile = student;
    await render();
    await click("EasyCode — главная");
    expect(container.querySelector("[data-profile]")?.textContent).toBe(
      student.id,
    );
    await click("В кабинет");
    expect(window.location.pathname + window.location.search).toBe("/learn");
    expect(container.querySelector("[data-profile]")?.textContent).toBe(
      student.id,
    );
    expect(mocks.onAuthStateChange).toHaveBeenCalledTimes(1);
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("opens teacher registration from the landing with an explicit role route", async () => {
    profile = null;
    window.history.replaceState({}, "", "/");
    await render();
    await click("Регистрация учителя");
    expect(window.location.pathname + window.location.search).toBe(
      "/register?role=teacher",
    );
    expect(container.querySelector("main")?.dataset.authMode).toBe("register");
    expect(container.querySelector("main")?.dataset.authRole).toBe("teacher");
    expect(mocks.api).toHaveBeenCalledExactlyOnceWith("/health", undefined, {
      anonymous: true,
    });
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
});
