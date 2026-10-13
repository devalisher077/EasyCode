// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Lesson } from "../shared/lessons";
import type { Account } from "./lib/useAccount";
import type { Catalog, Material } from "./lib/types";
import App from "./App";

const mocks = vi.hoisted(() => ({ api: vi.fn(), download: vi.fn() }));
vi.mock("./lib/api", () => ({
  api: mocks.api,
  downloadMaterial: mocks.download,
  ApiError: class extends Error {},
  supabase: null,
}));
vi.mock("./lib/useLessonProgress", () => ({
  useLessonProgress: () => ({
    progress: {},
    storage: "cloud",
    error: "",
    markStep: vi.fn(),
    checkQuiz: vi.fn(),
  }),
}));
vi.mock("./components/Course", () => ({
  Course: () => <div>Учебный курс</div>,
}));
vi.mock("./components/Practice", () => ({
  Practice: () => <div>Практическая среда</div>,
}));
vi.mock("./components/Classroom", () => ({
  Classroom: () => <div>Класс</div>,
}));
vi.mock("./components/AuthPanel", () => ({
  AuthPanel: () => <div>Форма входа</div>,
}));
vi.mock("./components/PresentationViewer", () => ({
  PresentationViewer: ({
    material,
    ownerId,
    demo,
    onClose,
    onDownload,
  }: {
    material: Material;
    ownerId: string;
    demo: boolean;
    onClose: () => void;
    onDownload: () => void;
  }) => (
    <section
      data-viewer
      data-owner={ownerId}
      data-demo={String(demo)}
      role="dialog"
      aria-label="Презентация"
    >
      <span>{material.path}</span>
      <button onClick={onClose}>Закрыть просмотр</button>
      <button onClick={onDownload}>Скачать оригинал PPTX</button>
    </section>
  ),
}));

const presentation: Material = {
  type: "presentation",
  audience: "all",
  path: "section-01/topic-01/Презентация.pptx",
};
const document: Material = {
  type: "teacher_notes",
  audience: "teacher",
  path: "section-01/topic-01/Конспект для учителя.docx",
};
const catalog: Catalog = {
  course: { title: "Основы", product: "EasyCode", target_grades: "3–6" },
  sections: [
    {
      number: 1,
      title: "Алгоритмы",
      topics: [
        {
          number: "1.1",
          title: "Что такое алгоритм?",
          materials: [presentation, document],
        },
      ],
    },
  ],
};
const lesson: Lesson = {
  id: "1.1",
  title: "Что такое алгоритм?",
  sectionNumber: 1,
  sectionTitle: "Алгоритмы",
  description: "Введение",
  durationMinutes: 10,
  goals: ["Понимать порядок команд"],
  steps: [
    {
      id: "intro",
      title: "Команды",
      paragraphs: ["Команды выполняются последовательно."],
    },
  ],
  quiz: [],
  practice: { title: "Маршрут", instructions: [], availableInSimulator: true },
  source: { kind: "adapted", label: "Учебный материал" },
};

let root: Root;
let container: HTMLDivElement;
let account: Account;
const initialProfile = {
  id: "teacher-a",
  name: "Марина",
  role: "teacher" as const,
};
const viewer = () => container.querySelector<HTMLElement>("[data-viewer]");

async function render(route = "/learn/topic/1.1") {
  await act(async () => {
    root.render(<App account={account} route={route} onNavigate={() => {}} />);
  });
}
async function click(text: string) {
  const target = [...container.querySelectorAll("button")].find((button) =>
    button.textContent?.includes(text),
  );
  if (!target) throw new Error(`Missing button: ${text}`);
  await act(async () => {
    target.click();
  });
}
async function open() {
  await click("Открыть презентацию");
  // The production viewer is lazy loaded; allow the mocked import to settle.
  await act(async () => {});
  expect(viewer()).not.toBeNull();
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mocks.api.mockReset();
  mocks.download.mockReset();
  mocks.download.mockResolvedValue(undefined);
  mocks.api.mockImplementation((path: string) => {
    if (path === "/catalog") return Promise.resolve(catalog);
    if (path.startsWith("/lessons/")) return Promise.resolve({ lesson });
    return Promise.reject(new Error(`Unexpected request: ${path}`));
  });
  account = {
    mode: "supabase",
    profile: initialProfile,
    sessionUserId: initialProfile.id,
    ready: true,
    error: "",
    refresh: vi.fn(),
    changeDemoRole: vi.fn(),
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.reject(
        new Error("Live network is disabled in integration tests"),
      ),
    ),
  );
  container = globalThis.document.createElement("div");
  globalThis.document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Dashboard sidebar", () => {
  it.each(["student", "teacher"] as const)("keeps only the upper navigation for %s", async (role) => {
    account = { ...account, profile: { ...initialProfile, role } };
    await render("/learn");
    const sidebar = container.querySelector(".sidebar")!;
    const menu = sidebar.querySelector('nav[aria-label="Главное меню"]')!;
    expect(menu.querySelectorAll("button")).toHaveLength(3);
    expect(menu.textContent).toContain("Мой курс");
    expect(menu.textContent).toContain("Практическая среда");
    expect(menu.textContent).toContain(role === "teacher" ? "Кабинет учителя" : "Мой класс");
    expect(sidebar.querySelector('nav[aria-label="Разделы курса"]')).toBeNull();
    expect(sidebar.textContent).not.toContain("РАЗДЕЛЫ КУРСА");
    expect(sidebar.textContent).not.toContain("Создать программу");
    expect(sidebar.querySelector(".build-card")).toBeNull();
  });
});

describe("Lesson presentation integration", () => {
  it("opens presentations in the scoped viewer while DOCX still downloads", async () => {
    await render();
    expect(container.querySelector(".lesson-materials")?.textContent).toContain(
      "Просмотр слайдов",
    );
    await click("Конспект для учителя");
    expect(mocks.download).toHaveBeenCalledExactlyOnceWith(document.path);
    await open();
    expect(viewer()?.dataset.owner).toBe("teacher-a");
    expect(viewer()?.dataset.demo).toBe("false");
    expect(viewer()?.textContent).toContain(presentation.path);
    expect(mocks.download).toHaveBeenCalledTimes(1);
    await click("Скачать оригинал PPTX");
    expect(mocks.download).toHaveBeenLastCalledWith(presentation.path);
    await click("Закрыть просмотр");
    await render();
    expect(viewer()).toBeNull();
  });

  it("reports original-download failures without closing the presentation", async () => {
    await render();
    await open();
    mocks.download.mockRejectedValueOnce(new Error("Материал недоступен"));
    await click("Скачать оригинал PPTX");
    expect(container.querySelector(".toast")?.textContent).toContain(
      "Материал недоступен",
    );
    expect(viewer()).not.toBeNull();
  });

  it("requires sign-in for presentation previews and protected document downloads", async () => {
    account = { ...account, profile: null, sessionUserId: null };
    await render();
    await click("Открыть презентацию");
    expect(viewer()).toBeNull();
    expect(
      container.querySelector('[role="dialog"][aria-label="Аккаунт"]'),
    ).not.toBeNull();
    expect(mocks.download).not.toHaveBeenCalled();
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Закрыть"]')!
        .click();
    });
    await click("Конспект для учителя");
    expect(
      container.querySelector('[role="dialog"][aria-label="Аккаунт"]'),
    ).not.toBeNull();
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("passes the demo scope to the viewer without requiring a real account", async () => {
    account = { ...account, mode: "demo", profile: null, sessionUserId: null };
    await render();
    await open();
    expect(viewer()?.dataset.demo).toBe("true");
  });

  it.each([
    "account",
    "session",
    "signout",
    "role",
    "ready",
    "error",
    "mode",
  ] as const)(
    "clears preview on %s changes and does not restore it on return",
    async (change) => {
      await render();
      await open();
      const before = account;
      if (change === "account")
        account = {
          ...account,
          profile: { ...initialProfile, id: "teacher-b" },
          sessionUserId: "teacher-b",
        };
      if (change === "role")
        account = {
          ...account,
          profile: { ...initialProfile, role: "student" },
        };
      if (change === "session")
        account = { ...account, sessionUserId: "teacher-b" };
      if (change === "signout")
        account = { ...account, profile: null, sessionUserId: null };
      if (change === "ready") account = { ...account, ready: false };
      if (change === "error")
        account = { ...account, error: "Ошибка проверки аккаунта" };
      if (change === "mode") account = { ...account, mode: "demo" };
      await render();
      expect(viewer()).toBeNull();
      account = before;
      await render();
      expect(viewer()).toBeNull();
    },
  );

  it("clears preview when navigating away from a lesson", async () => {
    await render();
    await open();
    await render("/learn/topic/1.2");
    expect(viewer()).toBeNull();
    await render();
    expect(viewer()).toBeNull();
  });

  it("closes the viewer before opening the account dialog and keeps it closed afterwards", async () => {
    await render();
    await open();
    await act(async () => {
      container.querySelector<HTMLButtonElement>(".account-label")!.click();
    });
    expect(viewer()).toBeNull();
    expect(container.querySelector('[aria-label="Аккаунт"]')).not.toBeNull();
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Закрыть"]')!
        .click();
    });
    expect(viewer()).toBeNull();
  });
});
