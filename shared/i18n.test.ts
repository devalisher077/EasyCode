import { describe, expect, it } from "vitest";
import { messages, translate } from "./i18n";
import {
  lessonCopies,
  localizeLesson,
  localizeQuizResult,
} from "./lesson-localization";
import { lessons } from "../content/lessons";
import { assessLesson, publicLesson } from "../server/lessons";
import { parseSync } from "rolldown/utils";
import { readFileSync, readdirSync } from "node:fs";
import * as BlocklyEnglish from 'blockly/msg/en';

describe("platform translations", () => {
  it('preserves Blockly accessibility message placeholders', () => {
    const source = parseSync('BlockEditor.tsx', readFileSync('src/components/BlockEditor.tsx', 'utf8')).program;
    const declaration = (source.body as any[]).flatMap(node => node.declarations || []).find(node => node.id?.name === 'kazakhMessages');
    expect(declaration).toBeDefined();
    for (const property of declaration.init.properties) {
      const original = (BlocklyEnglish as Record<string, unknown>)[property.key.name];
      expect(typeof original, property.key.name).toBe('string');
      const slots = (text: string) => [...text.matchAll(/%\d+/g)].map(m => m[0]).sort();
      expect.soft(slots(property.value.value), property.key.name).toEqual(slots(original as string));
    }
  });
  it("has unique, complete messages and matching interpolation slots", () => {
    const keys = new Set<string>();
    const slots = (s: string) =>
      [...s.matchAll(/\{\d+\}|%\d+/g)].map((m) => m[0]).sort();
    for (const [ru, en, kk] of messages) {
      expect(keys.has(ru), ru).toBe(false);
      keys.add(ru);
      expect(en.trim(), ru).not.toBe("");
      expect(kk.trim(), ru).not.toBe("");
      expect(slots(en), ru).toEqual(slots(ru));
      expect(slots(kk), ru).toEqual(slots(ru));
    }
  });
  it("translates nested errors and preserves unknown text, objects and whitespace", () => {
    expect(translate("Строка 3: неожиданный отступ.", "en")).toBe(
      "Line 3: unexpected indentation.",
    );
    expect(translate("Строка 3: неожиданный отступ.", "kk")).toBe(
      "3-жол: күтпеген шегініс.",
    );
    expect(translate(" Светодиод ", "en")).toBe(" LED ");
    expect(translate("Алишер", "en")).toBe("Алишер");
    const value = { name: "Свет" };
    expect(translate(value, "kk")).toBe(value);
    expect(translate("robot.forward(2)\n", "en")).toBe("robot.forward(2)\n");
  });
  it("covers every literal passed to the interface translation function", () => {
    const keys = new Set(
      messages.map(([key]) => key.replace(/\s+/g, " ").trim()),
    );
    const files = [
      "src/Root.tsx",
      "src/App.tsx",
      ...readdirSync("src/components")
        .filter((f) => f.endsWith(".tsx") && !f.includes(".test."))
        .map((f) => `src/components/${f}`),
    ];
    for (const file of files) {
      const program = parseSync(file, readFileSync(file, "utf8")).program;
      function walk(node: any) {
        if (!node || typeof node !== "object") return;
        if (
          node.type === "CallExpression" &&
          node.callee?.name === "t" &&
          node.arguments[0]?.type === "Literal"
        ) {
          const value = node.arguments[0].value;
          if (typeof value === "string" && /[А-Яа-яЁё]/.test(value))
            expect(
              keys.has(value.replace(/\s+/g, " ").trim()),
              `${file}: ${value}`,
            ).toBe(true);
        }
        for (const child of Object.values(node)) {
          if (Array.isArray(child)) child.forEach(walk);
          else if (child && typeof child === "object") walk(child);
        }
      }
      walk(program);
    }
  });
  for (const language of ["en", "kk"] as const) {
    it(`covers all 12 lessons in ${language} without changing IDs, code or exposing explanations`, () => {
      expect(Object.keys(lessonCopies[language]).sort()).toEqual(
        lessons.map((l) => l.id).sort(),
      );
      for (const definition of lessons) {
        const original = publicLesson(definition);
        const copy = lessonCopies[language][definition.id];
        const localized = localizeLesson(original, language);
        expect(copy.steps).toHaveLength(original.steps.length);
        expect(copy.quiz).toHaveLength(original.quiz.length);
        expect(localized.steps.map((s) => [s.id, s.code])).toEqual(
          original.steps.map((s) => [s.id, s.code]),
        );
        expect(
          localized.quiz.map((q) => [q.id, q.options.map((o) => o.id)]),
        ).toEqual(original.quiz.map((q) => [q.id, q.options.map((o) => o.id)]));
        copy.quiz.forEach((q, i) => {
          expect(q).toHaveLength(2); // Explanations are server-only until a check.
          expect(q[1]).toHaveLength(original.quiz[i].options.length);
        });
        expect(JSON.stringify(localized)).not.toContain("correctOptionId");
        expect(JSON.stringify(localized)).not.toContain('"explanation":');
        expect(localized.practice.availableInSimulator).toBe(
          original.practice.availableInSimulator,
        );
        const result = assessLesson(
          definition,
          Object.fromEntries(
            definition.quiz.map((q) => [q.id, q.correctOptionId]),
          ),
        );
        const translated = localizeQuizResult(original, result, language);
        expect(translated.score).toBe(result.score);
        expect(translated.passed).toBe(true);
        expect(
          translated.feedback.every(
            (f) => f.explanation === f.translations?.[language],
          ),
        ).toBe(true);
      }
    });
  }
});
