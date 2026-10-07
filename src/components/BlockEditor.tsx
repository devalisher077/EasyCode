import { useEffect, useRef, useState } from "react";
import * as Blockly from "blockly/core";
import * as Ru from "blockly/msg/ru";

export type BlockEditorProps = {
  initialState?: object;
  onChange: (code: string, state: object) => void;
};

// The ESM locale contains named strings; some TS interop configurations also
// describe a synthetic `default`. Only actual message strings belong here.
const russianMessages: Record<string, string> = {};
for (const [key, value] of Object.entries(Ru)) {
  if (typeof value === "string") russianMessages[key] = value;
}
Blockly.setLocale(russianMessages);
Blockly.common.defineBlocksWithJsonArray([
  {
    type: "easy_forward",
    message0: "вперёд %1 клеток",
    args0: [
      {
        type: "field_number",
        name: "COUNT",
        value: 1,
        min: 0,
        max: 100,
        precision: 1,
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: "#a855f7",
    tooltip: "Переместить машину вперёд на указанное число клеток.",
  },
  {
    type: "easy_backward",
    message0: "назад %1 клеток",
    args0: [
      {
        type: "field_number",
        name: "COUNT",
        value: 1,
        min: 0,
        max: 100,
        precision: 1,
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: "#a855f7",
  },
  {
    type: "easy_left",
    message0: "повернуть налево ↶",
    previousStatement: null,
    nextStatement: null,
    colour: "#a855f7",
  },
  {
    type: "easy_right",
    message0: "повернуть направо ↷",
    previousStatement: null,
    nextStatement: null,
    colour: "#a855f7",
  },
  {
    type: "easy_repeat",
    message0: "повторить %1 раз",
    args0: [
      {
        type: "field_number",
        name: "COUNT",
        value: 3,
        min: 0,
        max: 100,
        precision: 1,
      },
    ],
    message1: "%1",
    args1: [{ type: "input_statement", name: "BODY" }],
    previousStatement: null,
    nextStatement: null,
    colour: "#d38e36",
    tooltip: "Повторить команды внутри блока.",
  },
  {
    type: "easy_if",
    message0: "если впереди препятствие",
    message1: "%1",
    args1: [{ type: "input_statement", name: "BODY" }],
    message2: "иначе %1",
    args2: [{ type: "input_statement", name: "ELSE" }],
    previousStatement: null,
    nextStatement: null,
    colour: "#498ccc",
    tooltip: "Проверить препятствие или край поля перед машиной.",
  },
  {
    type: "easy_stop",
    message0: "остановиться ■",
    previousStatement: null,
    nextStatement: null,
    colour: "#b86391",
  },
]);

const theme = Blockly.Theme.defineTheme("easycode-dark", {
  name: "easycode-dark",
  base: Blockly.Themes.Classic,
  componentStyles: {
    workspaceBackgroundColour: "#15111d",
    toolboxBackgroundColour: "#1b1722",
    toolboxForegroundColour: "#f5f5f5",
    flyoutBackgroundColour: "#211a2c",
    flyoutForegroundColour: "#f5f5f5",
    flyoutOpacity: 1,
    scrollbarColour: "#5e496f",
    insertionMarkerColour: "#ffffff",
    insertionMarkerOpacity: 0.25,
    cursorColour: "#d8b4fe",
  },
  fontStyle: {
    family: "Inter, system-ui, sans-serif",
    weight: "500",
    size: 12,
  },
});

const initialBlocks = {
  blocks: {
    languageVersion: 0,
    blocks: [{ type: "easy_forward", x: 35, y: 45, fields: { COUNT: 2 } }],
  },
};

function workspaceCode(workspace: Blockly.WorkspaceSvg): string {
  let visited = 0;
  function chain(first: Blockly.Block | null, indent = 0): string {
    const lines: string[] = [];
    for (let block = first; block; block = block.getNextBlock()) {
      if (++visited > 400 || indent > 8)
        throw new Error("Программа из блоков слишком сложная.");
      if (!block.isEnabled()) continue;
      const prefix = "    ".repeat(indent);
      const count = Number(block.getFieldValue("COUNT"));
      const child = (name: string) =>
        chain(block!.getInputTargetBlock(name), indent + 1) ||
        `${prefix}    pass\n`;
      switch (block.type) {
        case "easy_forward":
          lines.push(`${prefix}robot.forward(${count})\n`);
          break;
        case "easy_backward":
          lines.push(`${prefix}robot.backward(${count})\n`);
          break;
        case "easy_left":
          lines.push(`${prefix}robot.turn_left()\n`);
          break;
        case "easy_right":
          lines.push(`${prefix}robot.turn_right()\n`);
          break;
        case "easy_stop":
          lines.push(`${prefix}robot.stop()\n`);
          break;
        case "easy_repeat":
          lines.push(`${prefix}for i in range(${count}):\n${child("BODY")}`);
          break;
        case "easy_if":
          lines.push(
            `${prefix}if robot.obstacle_ahead():\n${child("BODY")}${prefix}else:\n${child("ELSE")}`,
          );
          break;
        default:
          throw new Error("Неизвестный учебный блок.");
      }
    }
    return lines.join("");
  }
  return workspace
    .getTopBlocks(true)
    .map((block) => chain(block))
    .join("\n");
}

export function BlockEditor({ initialState, onChange }: BlockEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  const stateRef = useRef(initialState);
  const [compact, setCompact] = useState<boolean | null>(null);
  onChangeRef.current = onChange;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const updateLayout = () => setCompact(container.clientWidth < 480);
    updateLayout();
    const observer = new ResizeObserver(updateLayout);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || compact === null) return;
    const movementBlocks = [
      "easy_forward",
      "easy_backward",
      "easy_left",
      "easy_right",
    ].map((type) => ({ kind: "block", type }));
    const logicBlocks = ["easy_repeat", "easy_if", "easy_stop"].map((type) => ({
      kind: "block",
      type,
    }));
    const workspace = Blockly.inject(container, {
      toolbox: compact
        ? {
            kind: "categoryToolbox",
            contents: [
              {
                kind: "category",
                name: "Движение",
                colour: "#a855f7",
                contents: movementBlocks,
              },
              {
                kind: "category",
                name: "Логика",
                colour: "#d38e36",
                contents: logicBlocks,
              },
            ],
          }
        : {
            kind: "flyoutToolbox",
            contents: [
              { kind: "label", text: "ДВИЖЕНИЕ" },
              ...movementBlocks,
              { kind: "label", text: "ЛОГИКА" },
              ...logicBlocks,
            ],
          },
      horizontalLayout: compact,
      toolboxPosition: "start",
      theme,
      renderer: "zelos",
      media: "/blockly-media/",
      grid: { spacing: 24, length: 2, colour: "#3b3048", snap: true },
      zoom: {
        controls: true,
        wheel: false,
        startScale: compact ? 0.75 : 0.85,
        maxScale: 1.3,
        minScale: 0.5,
        scaleSpeed: 1.1,
      },
      move: { scrollbars: true, drag: true, wheel: true },
      trashcan: true,
      sounds: false,
      maxBlocks: 120,
    });
    try {
      Blockly.serialization.workspaces.load(
        stateRef.current ?? initialBlocks,
        workspace,
      );
    } catch {
      workspace.clear();
      Blockly.serialization.workspaces.load(initialBlocks, workspace);
    }
    if (compact) {
      const flyout = workspace.getFlyout();
      if (flyout) flyout.autoClose = true;
      workspace.getToolbox()?.clearSelection();
    }
    const changed = () => {
      let code: string;
      try {
        code = workspaceCode(workspace);
      } catch {
        code =
          "# Слишком сложная программа: убери лишние блоки.\ninvalid_program";
      }
      const state = Blockly.serialization.workspaces.save(workspace);
      stateRef.current = state;
      onChangeRef.current(code, state);
    };
    workspace.addChangeListener(changed);
    changed();
    const resize = new ResizeObserver(() => Blockly.svgResize(workspace));
    resize.observe(container);
    Blockly.svgResize(workspace);
    return () => {
      resize.disconnect();
      workspace.removeChangeListener(changed);
      stateRef.current = Blockly.serialization.workspaces.save(workspace);
      workspace.dispose();
    };
  }, [compact]);

  return (
    <div
      ref={containerRef}
      className="blockly-editor"
      aria-label="Редактор блочной программы"
      style={{ width: "100%", height: "100%", minHeight: 410 }}
    />
  );
}

export default BlockEditor;
