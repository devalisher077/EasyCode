// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAccount } from "./useAccount";
import type { Profile } from "./types";

// Auth and API are fully mocked: configured credentials never enter these tests.
const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  setDemoRole: vi.fn(),
  onAuthStateChange: vi.fn(),
  unsubscribe: vi.fn(),
  signOut: vi.fn(),
  updateUser: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("./api", () => ({
  api: mocks.api,
  setDemoRole: mocks.setDemoRole,
  supabase: {
    auth: {
      onAuthStateChange: mocks.onAuthStateChange,
      signOut: mocks.signOut,
      updateUser: mocks.updateUser,
      getSession: mocks.getSession,
    },
  },
}));

type Session = { user: { id: string } } | null;
type Listener = (event: string, session: Session) => unknown;
const alice: Profile = { id: "alice", name: "Алиса", role: "teacher" };
const bob: Profile = { id: "bob", name: "Борис", role: "student" };
const session = (id: string): Session => ({ user: { id } });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

let root: Root;
let container: HTMLDivElement;
let state: ReturnType<typeof useAccount>;
let listener: Listener;
let initialSession: Session;
function Harness({ workspace }: { workspace: boolean }) {
  state = useAccount(workspace);
  return null;
}
async function render(workspace: boolean) {
  await act(async () => root.render(<Harness workspace={workspace} />));
}
async function emit(event: string, nextSession: Session) {
  let result: unknown;
  await act(async () => {
    result = listener(event, nextSession);
  });
  // Supabase callbacks must not await authenticated API operations: they can
  // deadlock its auth lock. The request is deferred to a React effect instead.
  expect(result).toBeUndefined();
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  for (const mock of Object.values(mocks)) mock.mockReset();
  initialSession = null;
  mocks.onAuthStateChange.mockImplementation((callback: Listener) => {
    listener = callback;
    queueMicrotask(() => callback("INITIAL_SESSION", initialSession));
    return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
  });
  mocks.api.mockImplementation((path: string) => {
    if (path === "/health") return Promise.resolve({ mode: "supabase" });
    if (path === "/me") return Promise.resolve(alice);
    return Promise.reject(new Error(`Unexpected request: ${path}`));
  });
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

describe("useAccount", () => {
  it("leaves a signed-out public landing anonymous without requesting a profile", async () => {
    await render(false);
    expect(state).toMatchObject({
      mode: "supabase",
      profile: null,
      sessionUserId: null,
      ready: true,
      error: "",
    });
    expect(mocks.api).toHaveBeenCalledExactlyOnceWith("/health", undefined, {
      anonymous: true,
    });
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("retains the same account when leaving the workspace and returning", async () => {
    initialSession = session(alice.id);
    await render(true);
    expect(state.profile).toEqual(alice);
    expect(mocks.api).toHaveBeenLastCalledWith("/me", undefined, {
      expectedUserId: alice.id,
    });
    const requests = mocks.api.mock.calls.length;
    await render(false);
    expect(state.profile).toEqual(alice);
    await render(true);
    expect(state).toMatchObject({
      profile: alice,
      ready: true,
      sessionUserId: alice.id,
    });
    expect(mocks.api).toHaveBeenCalledTimes(requests);
    expect(mocks.onAuthStateChange).toHaveBeenCalledTimes(1);
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("does not clear or reload identity on token refresh or repeated sign-in events", async () => {
    initialSession = session(alice.id);
    await render(true);
    const requests = mocks.api.mock.calls.length;
    await emit("TOKEN_REFRESHED", session(alice.id));
    await emit("SIGNED_IN", session(alice.id));
    expect(state).toMatchObject({ profile: alice, ready: true, error: "" });
    expect(mocks.api).toHaveBeenCalledTimes(requests);
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("ignores an old account's late profile after switching users", async () => {
    const oldProfile = deferred<Profile>();
    initialSession = session(alice.id);
    mocks.api.mockImplementation(
      (path: string, _body: unknown, options?: { expectedUserId?: string }) => {
        if (path === "/health") return Promise.resolve({ mode: "supabase" });
        return options?.expectedUserId === alice.id
          ? oldProfile.promise
          : Promise.resolve(bob);
      },
    );
    await render(true);
    expect(state.ready).toBe(false);
    await emit("SIGNED_IN", session(bob.id));
    expect(state.profile).toEqual(bob);
    await act(async () => oldProfile.resolve(alice));
    expect(state).toMatchObject({
      profile: bob,
      sessionUserId: bob.id,
      ready: true,
      error: "",
    });
  });

  it("ignores a stale request failure after a new account has loaded", async () => {
    const oldProfile = deferred<Profile>();
    initialSession = session(alice.id);
    mocks.api.mockImplementation(
      (path: string, _body: unknown, options?: { expectedUserId?: string }) => {
        if (path === "/health") return Promise.resolve({ mode: "supabase" });
        return options?.expectedUserId === alice.id
          ? oldProfile.promise
          : Promise.resolve(bob);
      },
    );
    await render(true);
    await emit("SIGNED_IN", session(bob.id));
    await act(async () =>
      oldProfile.reject(new Error("Old account no longer exists")),
    );
    expect(state).toMatchObject({ profile: bob, ready: true, error: "" });
  });

  it("clears identity on actual sign-out and rejects the previous late response", async () => {
    const oldProfile = deferred<Profile>();
    initialSession = session(alice.id);
    mocks.api.mockImplementation((path: string) =>
      path === "/health"
        ? Promise.resolve({ mode: "supabase" })
        : oldProfile.promise,
    );
    await render(true);
    await emit("SIGNED_OUT", null);
    await act(async () => oldProfile.resolve(alice));
    expect(state).toMatchObject({
      profile: null,
      sessionUserId: null,
      ready: true,
    });
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("reports missing profile without deleting an authenticated session, then retries", async () => {
    initialSession = session(alice.id);
    let fail = true;
    mocks.api.mockImplementation((path: string) => {
      if (path === "/health") return Promise.resolve({ mode: "supabase" });
      return fail
        ? Promise.reject(new Error("Профиль ещё не создан"))
        : Promise.resolve(alice);
    });
    await render(false);
    expect(state).toMatchObject({
      profile: null,
      sessionUserId: alice.id,
      ready: true,
      error: "Профиль ещё не создан",
    });
    expect(mocks.signOut).not.toHaveBeenCalled();
    fail = false;
    await act(async () => state.refresh());
    expect(state).toMatchObject({ profile: alice, ready: true, error: "" });
  });

  it("keeps a profile failure visible when a slower health refresh succeeds", async () => {
    initialSession = session(alice.id);
    await render(true);
    const healthRefresh = deferred<{ mode: "supabase" }>();
    mocks.api.mockImplementation((path: string) =>
      path === "/health"
        ? healthRefresh.promise
        : Promise.reject(new Error("Профиль ещё не создан")),
    );
    await act(async () => state.refresh());
    expect(state).toMatchObject({
      profile: null,
      ready: true,
      error: "Профиль ещё не создан",
    });
    await act(async () => healthRefresh.resolve({ mode: "supabase" }));
    expect(state).toMatchObject({
      profile: null,
      ready: true,
      error: "Профиль ещё не создан",
    });
    expect(state.sessionUserId).toBe(alice.id);
  });

  it("clears the previous profile error on sign-out so guest learning can resume", async () => {
    initialSession = session(alice.id);
    mocks.api.mockImplementation((path: string) =>
      path === "/health"
        ? Promise.resolve({ mode: "supabase" })
        : Promise.reject(new Error("Профиль ещё не создан")),
    );
    await render(true);
    expect(state.error).toBe("Профиль ещё не создан");
    await emit("SIGNED_OUT", null);
    expect(state).toMatchObject({
      profile: null,
      sessionUserId: null,
      ready: true,
      error: "",
    });
    expect(mocks.api.mock.calls.map(([path]) => path)).toEqual([
      "/health",
      "/me",
    ]);
  });

  it("never changes a real account's role through the demo picker", async () => {
    initialSession = session(bob.id);
    mocks.api.mockImplementation((path: string) =>
      Promise.resolve(path === "/health" ? { mode: "supabase" } : bob),
    );
    await render(true);
    const requests = mocks.api.mock.calls.length;
    await act(async () => state.changeDemoRole("teacher"));
    expect(state.profile).toEqual(bob);
    expect(mocks.api).toHaveBeenCalledTimes(requests);
    expect(mocks.setDemoRole).not.toHaveBeenCalled();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("activates demo identity only in the workspace and keeps it on the landing", async () => {
    let demoProfile = bob;
    mocks.api.mockImplementation((path: string) =>
      Promise.resolve(path === "/health" ? { mode: "demo" } : demoProfile),
    );
    mocks.setDemoRole.mockImplementation(() => {
      demoProfile = alice;
    });
    await render(false);
    expect(state.profile).toBeNull();
    expect(mocks.api).toHaveBeenCalledTimes(1);
    await render(true);
    expect(state.profile).toEqual(bob);
    await act(async () => state.changeDemoRole("teacher"));
    expect(mocks.setDemoRole).toHaveBeenCalledWith("teacher");
    expect(state.profile).toEqual(alice);
    expect(mocks.api).toHaveBeenLastCalledWith("/me", undefined, undefined);
    await render(false);
    expect(state.profile).toEqual(alice);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("unsubscribes from Supabase when the account owner unmounts", async () => {
    await render(false);
    await act(async () => root.unmount());
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
    root = createRoot(container);
  });
});
