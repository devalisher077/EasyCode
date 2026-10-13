// @vitest-environment jsdom
import { act, cloneElement, isValidElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { AuthPanel } from "../components/AuthPanel";
import { Course } from "../components/Course";
import { LessonPage } from "../components/LessonPage";
import Electronics from "../components/Electronics";
import {
  getLanguage,
  LANGUAGE_STORAGE_KEY,
  setLanguage,
  t,
  useLanguage,
} from "./i18n";
import type { Lesson } from "../../shared/lessons";
const lesson: Lesson = {
  id: "1.1",
  title: "Что такое алгоритм?",
  sectionNumber: 1,
  sectionTitle: "Основы алгоритмов",
  description: "Описание",
  durationMinutes: 10,
  goals: ["Цель"],
  steps: ["concept", "example", "walkthrough", "recap"].map((id) => ({
    id,
    title: id,
    paragraphs: ["Текст"],
  })),
  quiz: [1, 2, 3].map((i) => ({
    id: `1.1-q${i}`,
    prompt: "Вопрос",
    options: ["a", "b", "c"].map((id) => ({ id, text: id })),
  })),
  practice: { title: "Практика", instructions: [], availableInSimulator: true },
  source: { kind: "adapted", label: "Материал" },
};

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("./api", () => ({
  api: mocks.api,
  supabase: null,
  ApiError: class extends Error {},
}));
vi.mock("../components/BlockEditor", () => ({
  default: () => <div>Editor</div>,
}));
let root: Root, container: HTMLDivElement;
function Shell({ children }: { children: React.ReactNode }) {
  useLanguage();
  return (
    <>
      <LanguageSwitcher />
      {isValidElement(children) ? cloneElement(children) : children}
    </>
  );
}
async function render(children: React.ReactNode) {
  await act(async () => root.render(<Shell>{children}</Shell>));
}
async function language(value: string) {
  await act(async () => {
    const select = container.querySelector<HTMLSelectElement>(
      ".language-switcher select",
    )!;
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function click(text: string) {
  const button = [...container.querySelectorAll("button")].find(
    (b) =>
      b.textContent?.trim() === text || b.getAttribute("aria-label") === text,
  );
  expect(button, text).toBeDefined();
  await act(async () => button!.click());
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear();
  setLanguage("ru");
  mocks.api.mockReset();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  setLanguage("ru");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("language selection", () => {
  it("persists the language, updates document lang and handles storage restrictions", async () => {
    await render(<p>{t("Мой курс")}</p>);
    await language("kk");
    expect(getLanguage()).toBe("kk");
    expect(document.documentElement.lang).toBe("kk");
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("kk");
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });
    await language("en");
    expect(getLanguage()).toBe("en");
    spy.mockRestore();
    await act(async () =>
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: LANGUAGE_STORAGE_KEY,
          newValue: "ru",
        }),
      ),
    );
    expect(getLanguage()).toBe("ru");
  });
  it("translates course titles and searches in the selected language without altering progress", async () => {
    const catalog = {
      course: {
        title: "Основы программирования",
        product: "EasyCode",
        target_grades: "3–6",
      },
      sections: [
        {
          number: 1,
          title: "Основы алгоритмов",
          topics: [
            {
              number: "1.1",
              title: "Что такое алгоритм?",
              materials: [],
              lesson: { stepIds: ["concept"], durationMinutes: 10 },
            },
          ],
        },
      ],
    };
    const course = (
      <Course
        catalog={catalog}
        query="algorithm"
        onTopic={vi.fn()}
        onPractice={vi.fn()}
        progress={{}}
        storage="local"
        storageError=""
      />
    );
    await render(course);
    await language("en");
    await render(course);
    expect(container.textContent).toContain("What is an algorithm?");
    expect(container.textContent).toContain("Learning course");
    await language("kk");
    await render(
      <Course
        catalog={catalog}
        query="алгоритм"
        onTopic={vi.fn()}
        onPractice={vi.fn()}
        progress={{}}
        storage="local"
        storageError=""
      />,
    );
    expect(container.textContent).toContain("Алгоритм деген не?");
  });
  it("preserves entered registration data and role while switching languages", async () => {
    const form = (
      <AuthPanel
        initialMode="register"
        initialRole="teacher"
        onComplete={vi.fn()}
        onNotice={vi.fn()}
      />
    );
    await render(form);
    const name =
      container.querySelector<HTMLInputElement>('input[name="name"]')!;
    name.value = "Свет";
    await language("en");
    await render(form);
    expect(container.querySelector('input[name="name"]')).toBe(name);
    expect(name.value).toBe("Свет");
    expect(container.textContent).toContain("Register as");
    expect(container.textContent).toContain("Teacher");
    await language("kk");
    await render(form);
    expect(name.value).toBe("Свет");
    expect(container.textContent).toContain("Мұғалім");
  });
  it("keeps lesson position and answers when language changes", async () => {
    mocks.api.mockResolvedValue({ lesson });
    const props = {
      lessonId: "1.1",
      progress: undefined,
      storage: "local" as const,
      storageError: "",
      onReadStep: vi.fn(),
      onCheckQuiz: vi.fn(),
      onBack: vi.fn(),
      onNavigateLesson: vi.fn(),
      onPractice: vi.fn(),
      onSignIn: vi.fn(),
      materials: [],
      onPreview: vi.fn(),
      onDownload: vi.fn(),
    };
    await render(<LessonPage {...props} />);
    const quizButton = container.querySelectorAll<HTMLButtonElement>(
      ".lesson-step-list button",
    )[4];
    await act(async () => quizButton.click());
    const answer = container.querySelector<HTMLInputElement>(
      'input[type="radio"]',
    )!;
    await act(async () => answer.click());
    await language("en");
    expect(
      container.querySelector<HTMLInputElement>('input[type="radio"]')?.checked,
    ).toBe(true);
    expect(container.textContent).toContain(
      "Which best describes an algorithm?",
    );
    await language("kk");
    expect(container.textContent).toContain(
      "Алгоритмді қай жауап дұрыс сипаттайды?",
    );
    expect(mocks.api).toHaveBeenCalledTimes(1);
  });
  it("preserves electronics code and circuit while changing languages", async () => {
    const lab = <Electronics draftOwner="student-a" onNotice={vi.fn()} />;
    await render(lab);
    await click("Код");
    const code = container.querySelector<HTMLTextAreaElement>("textarea")!;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!;
    await act(async () => {
      setter.call(code, "led.off()\nwait(300)");
      code.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const wires = container.querySelectorAll(".electronics-wires path").length;
    await language("en");
    await render(lab);
    expect(container.textContent).toContain("Virtual electronics");
    expect(container.querySelector("textarea")?.value).toBe(
      "led.off()\nwait(300)",
    );
    expect(container.querySelectorAll(".electronics-wires path")).toHaveLength(
      wires,
    );
    await language("kk");
    await render(lab);
    expect(container.textContent).toContain("Виртуалды электроника");
    expect(container.querySelector("textarea")?.value).toBe(
      "led.off()\nwait(300)",
    );
  });
});
