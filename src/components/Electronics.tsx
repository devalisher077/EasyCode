import { t } from "../lib/i18n";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  Check,
  CircuitBoard,
  Code2,
  HelpCircle,
  Layers3,
  MousePointer2,
  Play,
  Plus,
  RotateCcw,
  Save,
  Square,
  StepForward,
  Sun,
  Trash2,
  Undo2,
  Unplug,
  X,
} from "lucide-react";
import {
  checkElectronics,
  evaluateElectronics,
  EXERCISES,
  inspectCircuit,
  PARTS,
  STARTER_CODE,
  starterCircuit,
  validateCircuit,
  type Circuit,
  type ElectronicsFrame,
  type Exercise,
  type Inputs,
  type PartKind,
} from "../../shared/electronics";
import "./electronics.css";
const BlockEditor = lazy(() => import("./BlockEditor"));
const kinds = Object.keys(PARTS) as PartKind[];
const WIDTH = 820,
  HEIGHT = 560,
  PART_WIDTH = 170,
  PART_HEIGHT = 156;
const pinPosition = (circuit: Circuit, id: string) => {
  const [kind, name] = id.split(".");
  const part = circuit.parts.find((p) => p.kind === kind);
  if (!part) return { x: 0, y: 0 };
  const pins: readonly string[] = PARTS[part.kind].pins;
  return {
    x: part.x + ((pins.indexOf(name) + 1) * PART_WIDTH) / (pins.length + 1),
    y: part.y + PART_HEIGHT,
  };
};
const pinLabel = (id: string) => {
  const [kind, pin] = id.split(".");
  return `${PARTS[kind as PartKind]?.title || kind} · ${pin}`;
};

function loadDraft(owner: string) {
  const fallback = {
    circuit: starterCircuit(),
    exercise: "blink" as Exercise,
    code: STARTER_CODE,
    blocks: undefined as object | undefined,
    mode: "blocks" as "blocks" | "code",
  };
  try {
    const raw = localStorage.getItem(`easycode:electronics:v1:${owner}`);
    if (!raw || raw.length > 150000) return fallback;
    const data = JSON.parse(raw);
    if (
      !validateCircuit(data.circuit) ||
      !Object.hasOwn(EXERCISES, data.exercise) ||
      typeof data.code !== "string" ||
      data.code.length > 12000
    )
      return fallback;
    return {
      circuit: data.circuit as Circuit,
      exercise: data.exercise as Exercise,
      code: data.code,
      blocks:
        data.blocks && typeof data.blocks === "object"
          ? (data.blocks as object)
          : undefined,
      mode: data.mode === "code" ? ("code" as const) : ("blocks" as const),
    };
  } catch {
    return fallback;
  }
}

export default function Electronics({
  draftOwner,
  onNotice,
}: {
  draftOwner: string;
  onNotice: (message: string) => void;
}) {
  const [draft] = useState(() => loadDraft(draftOwner));
  const [circuit, setCircuit] = useState<Circuit>(draft.circuit);
  const [exercise, setExercise] = useState<Exercise>(draft.exercise);
  const [code, setCode] = useState(draft.code);
  const [blocks, setBlocks] = useState<object | undefined>(draft.blocks);
  const [blockCode, setBlockCode] = useState(STARTER_CODE);
  const [mode, setMode] = useState<"blocks" | "code">(draft.mode);
  const [inputs, setInputs] = useState<Inputs>({ pressed: false, light: 70 });
  const [running, setRunning] = useState(false);
  const [frame, setFrame] = useState<ElectronicsFrame | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [pending, setPending] = useState<string | null>(null);
  const [selected, setSelected] = useState<PartKind | null>(null);
  const [history, setHistory] = useState<Circuit[]>([]);
  const [status, setStatus] = useState(
    "Схема готова. Запустите симуляцию или измените соединения.",
  );
  const [error, setError] = useState("");
  const [check, setCheck] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [help, setHelp] = useState(false);
  const [saved, setSaved] = useState(false);
  const board = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    kind: PartKind;
    x: number;
    y: number;
    left: number;
    top: number;
    moved: boolean;
    before: Circuit;
  } | null>(null);
  const source = mode === "blocks" ? blockCode : code;
  const inspection = inspectCircuit(circuit, inputs);
  const connect = (id: string) => {
    if (running) return;
    if (!pending) {
      setPending(id);
      setStatus(`Выбран контакт ${pinLabel(id)}. Нажмите второй контакт.`);
      return;
    }
    if (pending === id) {
      setPending(null);
      return;
    }
    if (circuit.wires.length >= 24) {
      setError("Допустимо до 24 проводов.");
      setPending(null);
      return;
    }
    if (
      !circuit.wires.some(
        (w) =>
          (w.from === pending && w.to === id) ||
          (w.from === id && w.to === pending),
      )
    )
      edit({
        ...circuit,
        wires: [...circuit.wires, { from: pending, to: id }],
      });
    setPending(null);
    setStatus("Провод добавлен. Можно соединить следующую пару контактов.");
  };
  function edit(next: Circuit) {
    setHistory((old) => [...old.slice(-19), circuit]);
    setCircuit(next);
    setFrame(null);
    setError("");
    setStepIndex(0);
    setCheck(null);
    setSaved(false);
  }
  function stop() {
    setRunning(false);
    setFrame(null);
    setStepIndex(0);
    setStatus("Симуляция остановлена. Питание выключено.");
  }
  useEffect(() => {
    setCheck(null);
    setFrame(null);
    setStepIndex(0);
    setError("");
    setSaved(false);
  }, [source, circuit, exercise]);
  useEffect(() => {
    setFrame(null);
    setStepIndex(0);
  }, [inputs]);
  useEffect(() => {
    if (!running) return;
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    let frames: ElectronicsFrame[],
      index = 0;
    try {
      frames = evaluateElectronics(source, circuit, inputs).frames;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ошибка схемы.");
      setRunning(false);
      return;
    }
    const tick = () => {
      if (cancelled) return;
      const next = frames[index];
      setFrame(next);
      setStatus(next.command);
      index = (index + 1) % frames.length;
      timer = setTimeout(tick, next.delay || (index === 0 ? 80 : 25));
    };
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [running, source, circuit, inputs]);
  const step = () => {
    try {
      const result = evaluateElectronics(source, circuit, inputs);
      const next = result.frames[stepIndex % result.frames.length];
      setFrame(next);
      setStepIndex((i) => i + 1);
      setStatus(next.command);
      setError("");
    } catch (reason) {
      setFrame(null);
      setError(reason instanceof Error ? reason.message : "Ошибка программы.");
    }
  };
  const loadExercise = (next: Exercise) => {
    if (
      !window.confirm(
        t(
          "Загрузить стартовую схему? Текущая схема и программа будут заменены. Сохраните черновик, если хотите вернуться к нему после перезагрузки.",
        ),
      )
    )
      return;
    stop();
    setExercise(next);
    edit(starterCircuit(next));
    setCode(STARTER_CODE);
    setBlocks(undefined);
    setBlockCode(STARTER_CODE);
    setMode("code");
    setInputs({ pressed: false, light: 70 });
    setPending(null);
    setSelected(null);
  };
  const add = (kind: PartKind) => {
    if (circuit.parts.some((p) => p.kind === kind)) return;
    const position =
      kind === "controller"
        ? { x: 40, y: 40 }
        : { x: 40 + (circuit.parts.length % 3) * 260, y: 290 };
    edit({ ...circuit, parts: [...circuit.parts, { kind, ...position }] });
    setSelected(kind);
  };
  const movePart = (kind: PartKind, x: number, y: number) => ({
    ...circuit,
    parts: circuit.parts.map((p) =>
      p.kind === kind
        ? {
            ...p,
            x: Math.max(0, Math.min(620, x)),
            y: Math.max(0, Math.min(370, y)),
          }
        : p,
    ),
  });
  const ledOn = Boolean(
    frame?.on && inspection.ledReady && !inspection.errors.length && !error,
  );

  return (
    <div className="electronics-page page-container">
      <header className="page-heading">
        <div>
          <span className="eyebrow">{t("ИНТЕРАКТИВНАЯ ЛАБОРАТОРИЯ")}</span>
          <h1>{t("Виртуальная электроника")}</h1>
          <p>
            {t(
              "Соберите схему, соедините контакты и управляйте светом с помощью программы.",
            )}
          </p>
        </div>
        <button
          className="secondary-button"
          onClick={() => setHelp((v) => !v)}
          aria-expanded={help}
        >
          <HelpCircle size={16} />
          {t(" Как работать")}
        </button>
      </header>
      <section className="electronics-assignment">
        <CircuitBoard size={24} />
        <div>
          <label htmlFor="circuit-exercise">{t("Учебное задание")}</label>
          <select
            id="circuit-exercise"
            value={exercise}
            disabled={running}
            onChange={(e) => loadExercise(e.target.value as Exercise)}
          >
            {t(
              Object.entries(EXERCISES).map(([id, item]) => (
                <option key={id} value={id}>
                  {t(item.title)}
                </option>
              )),
            )}
          </select>
          <p>{t(EXERCISES[exercise].goal)}</p>
        </div>
        <span className="electronics-local">
          {t("Самопроверка · без облачной оценки")}
        </span>
      </section>
      {t(
        help && (
          <section className="electronics-help">
            <h2>{t("От схемы к программе")}</h2>
            <ol>
              <li>
                {t(
                  "Добавьте компоненты из списка. За заголовок можно перетащить деталь; стрелки клавиатуры тоже перемещают её.",
                )}
              </li>
              <li>
                {t(
                  "Нажмите контакт первой детали, затем второй — появится провод. Удалить соединение можно в списке проводов.",
                )}
              </li>
              <li>
                {t(
                  "Светодиод: D9 → резистор 220 Ом → A; K → GND. Кнопка: 5V → контакт 1, контакт 2 → D2. Датчик: VCC → 5V, GND → GND, OUT → A0.",
                )}
              </li>
              <li>
                {t(
                  "Запустите программу и меняйте входы. Она повторяется; изменение кнопки или света начинает новый проход. Перед редактированием схемы остановите симуляцию.",
                )}
              </li>
            </ol>
            <div className="electronics-command-list">
              <code>led.on()</code>
              <span>{t("Включить светодиод (выход D9)")}</span>
              <code>led.off()</code>
              <span>{t("Выключить светодиод")}</span>
              <code>wait(500)</code>
              <span>{t("Пауза в миллисекундах: 10–2000")}</span>
              <code>if button.pressed():</code>
              <span>{t("Нажата ли кнопка; поддерживается else")}</span>
              <code>if sensor.dark():</code>
              <span>{t("Свет ниже 40%; поддерживается else")}</span>
              <code>for i in range(3):</code>
              <span>{t("Повторить 1–20 раз, отступ — 4 пробела")}</span>
            </div>
            <p>
              {t(
                "Это ограниченный учебный Python, не Arduino C++. EasyBoard имеет виртуальную подтяжку D2 к земле. Датчик — готовый модуль, не отдельный фоторезистор. Ток, нагрев и аналоговые процессы не рассчитываются. Модель не подходит для проверки безопасности реальных схем.",
              )}
            </p>
          </section>
        ),
      )}
      <div className="electronics-toolbar">
        <div>
          <button
            className="primary-button"
            onClick={() => {
              setError("");
              setPending(null);
              if (running) stop();
              else setRunning(true);
            }}
          >
            {t(running ? <Square size={16} /> : <Play size={16} />)}
            {t(running ? "Остановить симуляцию" : "Запустить симуляцию")}
          </button>
          <button
            className="secondary-button"
            disabled={running}
            onClick={step}
          >
            <StepForward size={16} />
            {t(" Шаг")}
          </button>
        </div>
        <div>
          <button
            className="icon-button"
            disabled={running || !history.length}
            aria-label={t("Отменить изменение схемы")}
            title={t("Отменить изменение схемы")}
            onClick={() => {
              setCircuit(history.at(-1)!);
              setHistory((h) => h.slice(0, -1));
              setPending(null);
              setSelected(null);
            }}
          >
            <Undo2 size={18} />
          </button>
          <button
            className="secondary-button"
            onClick={() => {
              try {
                localStorage.setItem(
                  `easycode:electronics:v1:${draftOwner}`,
                  JSON.stringify({ circuit, exercise, code, blocks, mode }),
                );
                setSaved(true);
                onNotice(
                  "Схема и программа сохранены в этом браузере, отдельно для вашего аккаунта.",
                );
              } catch {
                onNotice("Браузер не разрешил сохранить черновик.");
              }
            }}
          >
            {t(saved ? <Check size={16} /> : <Save size={16} />)}
            {t(" Сохранить")}
          </button>
        </div>
      </div>
      <div className="electronics-workbench">
        <aside
          className="electronics-library"
          aria-label={t("Компоненты схемы")}
        >
          <h2>{t("Компоненты")}</h2>
          <p>{t("Нажмите, чтобы добавить")}</p>
          {t(
            kinds.map((kind) => (
              <button
                key={kind}
                disabled={running || circuit.parts.some((p) => p.kind === kind)}
                onClick={() => add(kind)}
              >
                <PartArt kind={kind} on={false} pressed={false} />
                <span>
                  <strong>{t(PARTS[kind].title)}</strong>
                  <small>{t(PARTS[kind].subtitle)}</small>
                </span>
                {t(
                  circuit.parts.some((p) => p.kind === kind) ? (
                    <Check size={14} />
                  ) : (
                    <Plus size={14} />
                  ),
                )}
              </button>
            )),
          )}
          <p className="electronics-library-note">
            {t(
              "По одному компоненту каждого типа. Начните с готовой схемы или удалите детали и соберите свою.",
            )}
          </p>
        </aside>
        <section className="electronics-canvas-panel">
          <div className="electronics-canvas-title">
            <span>
              <CircuitBoard size={16} />
              {t(" Монтажное поле")}
            </span>
            <span>
              {t(
                running
                  ? "Питание включено"
                  : frame
                    ? "Пошаговый режим"
                    : "Питание выключено",
              )}
            </span>
          </div>
          <div className="electronics-canvas-scroll">
            <div
              ref={board}
              className="electronics-canvas"
              style={{ width: WIDTH, height: HEIGHT }}
              aria-label={t("Монтажное поле схемы")}
            >
              <svg
                className="electronics-wires"
                viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                aria-hidden="true"
              >
                {t(
                  circuit.wires.map((wire, i) => {
                    const a = pinPosition(circuit, wire.from),
                      b = pinPosition(circuit, wire.to);
                    const bend = Math.min(
                      HEIGHT - 15,
                      Math.max(a.y, b.y) + 30 + (i % 4) * 16,
                    );
                    return (
                      <path
                        key={`${wire.from}:${wire.to}`}
                        className={
                          wire.from.includes("GND") || wire.to.includes("GND")
                            ? "is-ground"
                            : wire.from.includes("5V") || wire.to.includes("5V")
                              ? "is-power"
                              : ""
                        }
                        d={`M ${a.x} ${a.y} V ${bend} H ${b.x} V ${b.y}`}
                      />
                    );
                  }),
                )}
              </svg>
              {t(
                !circuit.parts.length && (
                  <p className="electronics-empty">
                    {t("Добавьте плату и компоненты из списка слева.")}
                  </p>
                ),
              )}
              {t(
                circuit.parts.map((part) => (
                  <div
                    key={part.kind}
                    className={`electronics-part ${selected === part.kind ? "is-selected" : ""} part-${part.kind}`}
                    style={{
                      left: part.x,
                      top: part.y,
                      width: PART_WIDTH,
                      height: PART_HEIGHT,
                    }}
                  >
                    <button
                      className="electronics-part-handle"
                      disabled={running}
                      aria-label={t(`Переместить: ${PARTS[part.kind].title}`)}
                      title={t("Перетащите или используйте стрелки клавиатуры")}
                      onClick={() => setSelected(part.kind)}
                      onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        setSelected(part.kind);
                        e.currentTarget.setPointerCapture(e.pointerId);
                        drag.current = {
                          kind: part.kind,
                          x: e.clientX,
                          y: e.clientY,
                          left: part.x,
                          top: part.y,
                          moved: false,
                          before: circuit,
                        };
                      }}
                      onPointerMove={(e) => {
                        const d = drag.current;
                        if (!d || d.kind !== part.kind) return;
                        const dx = e.clientX - d.x,
                          dy = e.clientY - d.y;
                        if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
                        if (d.moved)
                          setCircuit(
                            movePart(part.kind, d.left + dx, d.top + dy),
                          );
                      }}
                      onPointerUp={() => {
                        const d = drag.current;
                        if (d?.moved)
                          setHistory((h) => [...h.slice(-19), d.before]);
                        drag.current = null;
                      }}
                      onPointerCancel={() => {
                        const d = drag.current;
                        drag.current = null;
                        if (d) setCircuit(d.before);
                      }}
                      onKeyDown={(e) => {
                        const delta: Record<string, [number, number]> = {
                          ArrowLeft: [-10, 0],
                          ArrowRight: [10, 0],
                          ArrowUp: [0, -10],
                          ArrowDown: [0, 10],
                        };
                        if (delta[e.key]) {
                          e.preventDefault();
                          edit(
                            movePart(
                              part.kind,
                              part.x + delta[e.key][0],
                              part.y + delta[e.key][1],
                            ),
                          );
                        }
                      }}
                    >
                      <MousePointer2 size={12} />
                      {t(PARTS[part.kind].title)}
                    </button>
                    <PartArt
                      kind={part.kind}
                      on={ledOn}
                      pressed={inputs.pressed}
                    />
                    <span className="electronics-part-value">
                      {t(
                        part.kind === "led"
                          ? ledOn
                            ? "Свет включён"
                            : "Свет выключен"
                          : part.kind === "resistor"
                            ? "220 Ω"
                            : part.kind === "sensor"
                              ? `${inputs.light}% света`
                              : part.kind === "button"
                                ? inputs.pressed
                                  ? "Нажата"
                                  : "Отпущена"
                                : "EasyBoard · 5V",
                      )}
                    </span>
                    <div className="electronics-pins">
                      {t(
                        PARTS[part.kind].pins.map((pin, i) => {
                          const id = `${part.kind}.${pin}`;
                          return (
                            <button
                              key={pin}
                              style={{
                                left: `${((i + 1) * 100) / (PARTS[part.kind].pins.length + 1)}%`,
                              }}
                              className={pending === id ? "is-pending" : ""}
                              disabled={running}
                              aria-label={t(`Контакт ${pinLabel(id)}`)}
                              aria-pressed={pending === id}
                              onClick={() => connect(id)}
                            >
                              <span>{t(pin)}</span>
                              <i />
                            </button>
                          );
                        }),
                      )}
                    </div>
                  </div>
                )),
              )}
            </div>
          </div>
          <div className="electronics-canvas-bottom">
            <span>
              {t(
                pending
                  ? `Соединяем: ${pinLabel(pending)}`
                  : "Нажмите два контакта, чтобы добавить провод",
              )}
            </span>
            {t(
              pending && (
                <button
                  className="text-button"
                  onClick={() => setPending(null)}
                >
                  <X size={14} />
                  {t("Отмена")}
                </button>
              ),
            )}
            <button
              className="text-button"
              disabled={!selected || running}
              onClick={() => {
                if (!selected) return;
                edit({
                  parts: circuit.parts.filter((p) => p.kind !== selected),
                  wires: circuit.wires.filter(
                    (w) =>
                      !w.from.startsWith(`${selected}.`) &&
                      !w.to.startsWith(`${selected}.`),
                  ),
                });
                setSelected(null);
                setPending(null);
              }}
            >
              <Trash2 size={14} />
              {t("Удалить деталь")}
            </button>
          </div>
        </section>
      </div>
      <section
        className="electronics-inputs"
        aria-label={t("Входы симулятора")}
      >
        <div>
          <span className={`electronics-led-status ${ledOn ? "is-on" : ""}`} />
          <strong>
            {t("Светодиод: ")}
            {t(ledOn ? "включён" : "выключен")}
          </strong>
        </div>
        <button
          className={`secondary-button ${inputs.pressed ? "is-pressed" : ""}`}
          disabled={!circuit.parts.some((p) => p.kind === "button")}
          aria-pressed={inputs.pressed}
          onClick={() =>
            setInputs((old) => ({ ...old, pressed: !old.pressed }))
          }
        >
          {t(inputs.pressed ? "Отпустить кнопку" : "Нажать кнопку")}
        </button>
        <label>
          <Sun size={18} />
          {t(" Свет: ")}
          {t(inputs.light)}%
          <input
            aria-label={t("Освещённость датчика")}
            type="range"
            min="0"
            max="100"
            disabled={!circuit.parts.some((p) => p.kind === "sensor")}
            value={inputs.light}
            onChange={(e) =>
              setInputs((old) => ({ ...old, light: Number(e.target.value) }))
            }
          />
        </label>
      </section>
      <div className="electronics-bottom-grid">
        <section className="electronics-editor">
          <div className="panel-bar">
            <div className="tabs">
              <button
                className={mode === "blocks" ? "selected" : ""}
                onClick={() => {
                  stop();
                  setMode("blocks");
                }}
              >
                <Layers3 size={16} />
                {t("Блоки")}
              </button>
              <button
                className={mode === "code" ? "selected" : ""}
                onClick={() => {
                  stop();
                  setMode("code");
                }}
              >
                <Code2 size={16} />
                {t("Код")}
              </button>
            </div>
            <span>{t("Учебный Python")}</span>
          </div>
          {t(
            mode === "blocks" ? (
              <Suspense
                fallback={
                  <div className="empty-state">{t("Загружаем блоки…")}</div>
                }
              >
                <BlockEditor
                  variant="electronics"
                  initialState={blocks}
                  onChange={(next, state) => {
                    setBlockCode(next);
                    setBlocks(state);
                  }}
                />
              </Suspense>
            ) : (
              <textarea
                className="electronics-code"
                aria-label={t("Код электроники")}
                spellCheck={false}
                maxLength={12000}
                value={code}
                onChange={(e) => {
                  stop();
                  setCode(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Tab") {
                    e.preventDefault();
                    const target = e.currentTarget,
                      start = target.selectionStart;
                    setCode(
                      code.slice(0, start) +
                        "    " +
                        code.slice(target.selectionEnd),
                    );
                    requestAnimationFrame(() => {
                      target.selectionStart = target.selectionEnd = start + 4;
                    });
                  }
                }}
              />
            ),
          )}
          <div className="electronics-editor-footer">
            {t(
              mode === "blocks" && (
                <button
                  className="text-button"
                  onClick={() => {
                    if (
                      code !== STARTER_CODE &&
                      code !== blockCode &&
                      !window.confirm(
                        t("Заменить текстовую программу кодом из блоков?"),
                      )
                    )
                      return;
                    stop();
                    setCode(blockCode);
                    setMode("code");
                  }}
                >
                  {t("Показать код из блоков ")}
                  <Code2 size={14} />
                </button>
              ),
            )}
            <button
              className="text-button"
              onClick={() => {
                if (
                  !window.confirm(
                    t(
                      "Заменить текстовую программу готовым примером для этого задания?",
                    ),
                  )
                )
                  return;
                stop();
                setCode(EXERCISES[exercise].example);
                setMode("code");
              }}
            >
              <RotateCcw size={14} />
              {t("Пример программы")}
            </button>
          </div>
        </section>
        <section className="electronics-inspector">
          <h2>{t("Проверка схемы")}</h2>
          <div className="electronics-console" role="status">
            {t(error || status)}
          </div>
          {t(
            inspection.errors.length > 0 && (
              <ul className="electronics-issues">
                {t(
                  inspection.errors.map((message) => (
                    <li key={message}>{t(message)}</li>
                  )),
                )}
              </ul>
            ),
          )}
          <button
            className="primary-button"
            disabled={running}
            onClick={() => {
              setCheck(checkElectronics(source, circuit, exercise));
            }}
          >
            <Check size={16} />
            {t("Проверить задание")}
          </button>
          {t(
            check && (
              <p
                className={`electronics-check ${check.success ? "is-success" : ""}`}
                role="status"
              >
                {t(check.message)}
              </p>
            ),
          )}
          <p className="electronics-disclaimer">
            {t(
              "Черновик сохраняется только в этом браузере. Эта самопроверка не записывает оценку учителю или прогресс курса.",
            )}
          </p>
          <details className="electronics-connections">
            <summary>
              {t("Соединения · ")}
              {t(circuit.wires.length)}
            </summary>
            <ul>
              {t(
                circuit.wires.map((wire, i) => (
                  <li key={`${wire.from}:${wire.to}`}>
                    <span>
                      {t(pinLabel(wire.from))} → {t(pinLabel(wire.to))}
                    </span>
                    <button
                      className="icon-button"
                      disabled={running}
                      aria-label={t(
                        `Удалить провод ${pinLabel(wire.from)} — ${pinLabel(wire.to)}`,
                      )}
                      onClick={() =>
                        edit({
                          ...circuit,
                          wires: circuit.wires.filter((_, n) => n !== i),
                        })
                      }
                    >
                      <Unplug size={16} />
                    </button>
                  </li>
                )),
              )}
            </ul>
          </details>
        </section>
      </div>
    </div>
  );
}

function PartArt({
  kind,
  on,
  pressed,
}: {
  kind: PartKind;
  on: boolean;
  pressed: boolean;
}) {
  return (
    <svg
      className={`electronics-part-art art-${kind} ${on && kind === "led" ? "is-on" : ""}`}
      viewBox="0 0 130 70"
      aria-hidden="true"
    >
      {t(
        kind === "controller" && (
          <>
            <rect
              x="10"
              y="5"
              width="110"
              height="60"
              rx="6"
              fill="#174579"
              stroke="#4e97df"
            />
            <rect
              x="43"
              y="20"
              width="43"
              height="29"
              rx="3"
              fill="#0b1422"
              stroke="#7091b3"
            />
            <path
              d="M50 17V9 M60 17V9 M70 17V9 M80 17V9 M50 51V60 M60 51V60 M70 51V60 M80 51V60"
              stroke="#b9c8d9"
              strokeWidth="3"
            />
            <rect x="4" y="21" width="20" height="26" rx="2" fill="#bacada" />
            <circle cx="105" cy="16" r="4" fill="#93c5fd" />
            <text x="65" y="39" textAnchor="middle" fill="#9fbada" fontSize="9">
              EC-01
            </text>
          </>
        ),
      )}
      {t(
        kind === "resistor" && (
          <>
            <path d="M8 35H122" stroke="#a8b6c5" strokeWidth="4" />
            <rect x="30" y="22" width="70" height="26" rx="10" fill="#d4bd93" />
            <path d="M44 22V48 M55 22V48" stroke="#b93c46" strokeWidth="6" />
            <path d="M70 22V48" stroke="#885732" strokeWidth="6" />
            <path d="M86 23V47" stroke="#ad903f" strokeWidth="4" />
          </>
        ),
      )}
      {t(
        kind === "led" && (
          <>
            <path d="M54 43V69 M77 43V64" stroke="#b9c8d9" strokeWidth="4" />
            <path
              d="M43 43V27a22 22 0 0 1 44 0v16Z"
              fill={on ? "#7fdcff" : "#254567"}
              stroke={on ? "#d0f5ff" : "#54799f"}
              strokeWidth="2"
            />
            <rect
              x="39"
              y="42"
              width="52"
              height="7"
              rx="3"
              fill={on ? "#acdfff" : "#345777"}
            />
            <path
              d="M53 27Q53 15 65 15"
              stroke="#d4edff"
              opacity=".6"
              strokeWidth="4"
              fill="none"
            />
          </>
        ),
      )}
      {t(
        kind === "button" && (
          <>
            <path
              d="M32 20H20 M32 50H20 M98 20H110 M98 50H110"
              stroke="#b9c8d9"
              strokeWidth="5"
            />
            <rect x="30" y="10" width="70" height="50" rx="5" fill="#9ba6b2" />
            <circle
              cx="65"
              cy="35"
              r={pressed ? 15 : 20}
              fill={pressed ? "#3b82f6" : "#172232"}
              stroke="#43556c"
              strokeWidth="3"
            />
          </>
        ),
      )}
      {t(
        kind === "sensor" && (
          <>
            <rect
              x="27"
              y="8"
              width="76"
              height="55"
              rx="5"
              fill="#1a524f"
              stroke="#4b9b90"
            />
            <circle cx="65" cy="33" r="21" fill="#d5bf91" />
            <path
              d="M50 22h23v7H55v8h20v7H52"
              fill="none"
              stroke="#7b472b"
              strokeWidth="3"
            />
            <path
              d="M45 63V70 M65 63V70 M85 63V70"
              stroke="#c4d0da"
              strokeWidth="4"
            />
          </>
        ),
      )}
    </svg>
  );
}
