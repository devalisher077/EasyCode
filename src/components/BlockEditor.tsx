import { t, useLanguage } from "../lib/i18n";
import { useEffect, useRef, useState } from "react";
import * as Blockly from "blockly/core";
import * as Ru from "blockly/msg/ru";
import * as En from "blockly/msg/en";

export type BlockEditorProps = {
  variant?: "robot" | "electronics";
  initialState?: object;
  onChange: (code: string, state: object) => void;
};

// The ESM locale contains named strings; some TS interop configurations also
// describe a synthetic `default`. Only actual message strings belong here.
const russianMessages: Record<string, string> = {};
for (const [key, value] of Object.entries(Ru)) {
  if (typeof value === "string") russianMessages[key] = value;
}
const blockDefinitions = [
  {
    type: "circuit_led",
    message0: "светодиод %1",
    args0: [
      {
        type: "field_dropdown",
        name: "STATE",
        options: [
          ["включить", "on"],
          ["выключить", "off"],
        ],
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: "#3b82f6",
  },
  {
    type: "circuit_wait",
    message0: "подождать %1 мс",
    args0: [
      {
        type: "field_number",
        name: "MS",
        value: 500,
        min: 10,
        max: 2000,
        precision: 1,
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: "#d38e36",
  },
  {
    type: "circuit_if",
    message0: "если %1",
    args0: [
      {
        type: "field_dropdown",
        name: "INPUT",
        options: [
          ["кнопка нажата", "button.pressed"],
          ["темно (свет < 40%)", "sensor.dark"],
        ],
      },
    ],
    message1: "%1",
    args1: [{ type: "input_statement", name: "BODY" }],
    message2: "иначе %1",
    args2: [{ type: "input_statement", name: "ELSE" }],
    previousStatement: null,
    nextStatement: null,
    colour: "#498ccc",
  },
  {
    type: "circuit_repeat",
    message0: "повторить %1 раз",
    args0: [
      {
        type: "field_number",
        name: "COUNT",
        value: 3,
        min: 1,
        max: 20,
        precision: 1,
      },
    ],
    message1: "%1",
    args1: [{ type: "input_statement", name: "BODY" }],
    previousStatement: null,
    nextStatement: null,
    colour: "#d38e36",
  },
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
    colour: "#3b82f6",
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
    colour: "#3b82f6",
  },
  {
    type: "easy_left",
    message0: "повернуть налево ↶",
    previousStatement: null,
    nextStatement: null,
    colour: "#3b82f6",
  },
  {
    type: "easy_right",
    message0: "повернуть направо ↷",
    previousStatement: null,
    nextStatement: null,
    colour: "#3b82f6",
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
];

const kazakhMessages = {
  WORKSPACE_LABEL_PLAIN: "Блоктардың жұмыс аймағы.",
  WORKSPACE_ROLEDESCRIPTION: "жұмыс аймағы",
  WORKSPACE_LABEL_1_STACK: "1 блок тізбегі",
  WORKSPACE_LABEL_MANY_STACKS: "%1 блок тізбегі",
  WORKSPACE_LABEL_FLYOUT_WORKSPACE: "%1 блоктары",
  WORKSPACE_LABEL_MUTATOR_WORKSPACE: "Блок редакторының жұмыс аймағы",
  WORKSPACE_CONTENTS_BLOCKS_MANY: "Жұмыс аймағында %1 блок тізбегі%2 бар.",
  WORKSPACE_CONTENTS_BLOCKS_ONE: "Жұмыс аймағында бір блок тізбегі%2 бар.",
  WORKSPACE_CONTENTS_BLOCKS_ZERO: "Жұмыс аймағында блоктар жоқ%2.",
  WORKSPACE_CONTENTS_COMMENTS_MANY: " және %1 түсініктеме",
  WORKSPACE_CONTENTS_COMMENTS_ONE: " және бір түсініктеме",
  BLOCK_LABEL_BEGIN_STACK: "Тізбектің басы",
  BLOCK_LABEL_BEGIN_PREFIX: "%1 басы",
  BLOCK_LABEL_HAS_INPUT: "кірісі бар",
  BLOCK_LABEL_HAS_INPUTS: "кірістері бар",
  BLOCK_LABEL_HAS_BRANCHES: "%1 тармағы бар",
  BLOCK_LABEL_DISABLED: "өшірулі",
  BLOCK_LABEL_COLLAPSED: "жиналған",
  BLOCK_LABEL_REPLACEABLE: "ауыстырылатын",
  BLOCK_LABEL_STATEMENT: "команда",
  BLOCK_LABEL_CONTAINER: "контейнер",
  BLOCK_LABEL_VALUE: "мән",
  BLOCK_LABEL_STACK_BLOCKS: "%1 тізбек блогы",
  BLOCK_LABEL_TOOLBOX_CATEGORY: "%1 санаты",
  INPUT_LABEL_INDEX: "%1 кірісі",
  INPUT_LABEL_VALUE: "мән",
  INPUT_LABEL_STATEMENT: "команда",
  INPUT_LABEL_END_STATEMENT: "%1 командасының соңы",
  INPUT_LABEL_EMPTY: "бос",
  INPUT_LABEL_CONDITION: "шарт",
  ARIA_TYPE_FIELD_NUMBER: "сан",
  ARIA_TYPE_FIELD_DROPDOWN: "тізім",
  ARIA_TYPE_FIELD_INPUT: "енгізу",
  ARIA_TYPE_FIELD_TEXT_INPUT: "мәтін",
  FIELD_LABEL_EDIT_PREFIX: "%1 өзгерту",
  FIELD_LABEL_EMPTY: "бос",
  FIELD_LABEL_OPTION_INDEX: "%1-нұсқа",
  ARIA_LABEL_TRASH_EMPTY: "Себет бос",
  OPEN_TRASH: "Себетті ашу",
  ZOOM_IN: "Үлкейту",
  ZOOM_OUT: "Кішірейту",
  RESET_ZOOM: "Масштабты қалпына келтіру",
  ARIA_LABEL_BUTTON: "батырма",
  ARIA_LABEL_HEADING: "тақырып",
  ARIA_LABEL_COMMENT: "Түсініктеме",
  ARIA_LABEL_COMMENT_COLLAPSE: "Түсініктемені жинау",
  ARIA_LABEL_COMMENT_EXPAND: "Түсініктемені жаю",
  ADD_COMMENT: "Түсініктеме қосу",
  REMOVE_COMMENT: "Түсініктемені жою",
  DUPLICATE_BLOCK: "Көшірмесін жасау",
  DELETE_BLOCK: "Блокты жою",
  DELETE_X_BLOCKS: "%1 блокты жою",
  DELETE_ALL_BLOCKS: "Барлық %1 блокты жою керек пе?",
  CLEAN_UP: "Блоктарды реттеу",
  COLLAPSE_BLOCK: "Блокты жинау",
  COLLAPSE_ALL: "Блоктарды жинау",
  EXPAND_BLOCK: "Блокты жаю",
  EXPAND_ALL: "Блоктарды жаю",
  DISABLE_BLOCK: "Блокты өшіру",
  ENABLE_BLOCK: "Блокты қосу",
  HELP: "Анықтама",
  UNDO: "Болдырмау",
  REDO: "Қайталау",
  NEW_VARIABLE: "Айнымалы құру…",
  RENAME_VARIABLE: "«%1» айнымалысының атауын өзгерту…",
  RENAME_VARIABLE_TITLE: "Барлық «%1» айнымалыларының атауын өзгерту:",
  DELETE_VARIABLE: "«%1» айнымалысын жою",
};
function translatedDefinitions(value: unknown): any {
  if (typeof value === "string") return t(value);
  if (Array.isArray(value)) return value.map(translatedDefinitions);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        translatedDefinitions(child),
      ]),
    );
  return value;
}
for (const definition of blockDefinitions) {
  Blockly.Blocks[definition.type] = {
    init(this: Blockly.Block) {
      this.jsonInit(translatedDefinitions(definition));
    },
  };
}

const theme = Blockly.Theme.defineTheme("easycode-dark", {
  name: "easycode-dark",
  base: Blockly.Themes.Classic,
  componentStyles: {
    workspaceBackgroundColour: "#10171e",
    toolboxBackgroundColour: "#141f32",
    toolboxForegroundColour: "#f5f5f5",
    flyoutBackgroundColour: "#18222e",
    flyoutForegroundColour: "#f5f5f5",
    flyoutOpacity: 1,
    scrollbarColour: "#495b6f",
    insertionMarkerColour: "#ffffff",
    insertionMarkerOpacity: 0.25,
    cursorColour: "#b4d7fe",
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
const circuitBlocks = {
  blocks: {
    languageVersion: 0,
    blocks: [
      {
        type: "circuit_led",
        x: 25,
        y: 40,
        fields: { STATE: "on" },
        next: { block: { type: "circuit_wait", fields: { MS: 500 } } },
      },
    ],
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
        case "circuit_led":
          lines.push(`${prefix}led.${block.getFieldValue("STATE")}()\n`);
          break;
        case "circuit_wait":
          lines.push(`${prefix}wait(${Number(block.getFieldValue("MS"))})\n`);
          break;
        case "circuit_if":
          lines.push(
            `${prefix}if ${block.getFieldValue("INPUT")}():\n${child("BODY")}${prefix}else:\n${child("ELSE")}`,
          );
          break;
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
        case "circuit_repeat":
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

export function BlockEditor({
  initialState,
  onChange,
  variant = "robot",
}: BlockEditorProps) {
  const language = useLanguage();
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
    const englishMessages = Object.fromEntries(
      Object.entries(En).filter(([, value]) => typeof value === "string"),
    ) as Record<string, string>;
    Blockly.setLocale(
      language === "ru"
        ? russianMessages
        : language === "kk"
          ? { ...englishMessages, ...kazakhMessages }
          : englishMessages,
    );
    // Recreate labels without altering serialized block types or field values.
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
    const defaults = variant === "electronics" ? circuitBlocks : initialBlocks;
    const workspace = Blockly.inject(container, {
      toolbox:
        variant === "electronics"
          ? {
              kind: "categoryToolbox",
              contents: [
                {
                  kind: "category",
                  name: t("Свет"),
                  colour: "#3b82f6",
                  contents: [
                    { kind: "block", type: "circuit_led" },
                    { kind: "block", type: "circuit_wait" },
                  ],
                },
                {
                  kind: "category",
                  name: t("Логика"),
                  colour: "#498ccc",
                  contents: [
                    { kind: "block", type: "circuit_if" },
                    { kind: "block", type: "circuit_repeat" },
                  ],
                },
              ],
            }
          : compact
            ? {
                kind: "categoryToolbox",
                contents: [
                  {
                    kind: "category",
                    name: t("Движение"),
                    colour: "#3b82f6",
                    contents: movementBlocks,
                  },
                  {
                    kind: "category",
                    name: t("Логика"),
                    colour: "#d38e36",
                    contents: logicBlocks,
                  },
                ],
              }
            : {
                kind: "flyoutToolbox",
                contents: [
                  { kind: "label", text: t("ДВИЖЕНИЕ") },
                  ...movementBlocks,
                  { kind: "label", text: t("ЛОГИКА") },
                  ...logicBlocks,
                ],
              },
      horizontalLayout: compact,
      toolboxPosition: "start",
      theme,
      renderer: "zelos",
      media: "/blockly-media/",
      grid: { spacing: 24, length: 2, colour: "#303b48", snap: true },
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
        stateRef.current ?? defaults,
        workspace,
      );
    } catch {
      workspace.clear();
      Blockly.serialization.workspaces.load(defaults, workspace);
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
  }, [compact, variant, language]);

  return (
    <div
      ref={containerRef}
      className="blockly-editor"
      aria-label={t("Редактор блочной программы")}
      style={{ width: "100%", height: "100%", minHeight: 410 }}
    />
  );
}

export default BlockEditor;
