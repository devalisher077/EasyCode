import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Code2,
  Flag,
  HelpCircle,
  Layers3,
  Play,
  RotateCcw,
  Save,
  Square,
  StepForward,
  Terminal,
} from "lucide-react";
import {
  DEFAULT_WORLD,
  evaluateCode,
  type Frame,
  type RunResult,
  type World,
} from "../../shared/simulator";
import { api } from "../lib/api";
import type { Task } from "../lib/types";
const BlockEditor = lazy(() => import("./BlockEditor"));
const starter = "# Пример программы\nrobot.forward(2)\n";
const defaultTask: Task = {
  id: "intro-route",
  class_id: null,
  title: "Доставка на Марс",
  description:
    "Составьте программу движения машины к финишу. Маршрут должен обходить препятствия и оставаться в границах поля.",
  difficulty: "easy",
  world: DEFAULT_WORLD,
};
export function Practice({
  initialTask,
  onNotice,
  draftOwner,
  canUseCloud,
  onRequireAuth,
}: {
  initialTask?: Task;
  onNotice: (message: string) => void;
  draftOwner: string;
  canUseCloud: boolean;
  onRequireAuth: () => void;
}) {
  const [task, setTask] = useState<Task>(initialTask || defaultTask);
  const [mode, setMode] = useState<"blocks" | "code">("blocks");
  const [blockCode, setBlockCode] = useState("robot.forward(2)\n");
  const [code, setCode] = useState(starter);
  const [blocks, setBlocks] = useState<object>();
  const [result, setResult] = useState<RunResult | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const [saved, setSaved] = useState(false);
  const [ready, setReady] = useState(false);
  const generation = useRef(0);
  const source = mode === "blocks" ? blockCode : code;
  useEffect(() => {
    if (initialTask || !canUseCloud) return;
    let current = true;
    api<{ tasks: Task[] }>("/tasks")
      .then((data) => {
        if (!current) return;
        const builtIn = data.tasks.find((t) => t.id === "intro-route");
        if (builtIn) setTask(builtIn);
      })
      .catch((e) => {
        if (current) onNotice(e.message);
      });
    return () => {
      current = false;
    };
  }, [initialTask, canUseCloud, onNotice]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(
        `easycode:draft:${draftOwner}:${task.id}`,
      );
      if (raw) {
        const data = JSON.parse(raw);
        if (typeof data.code === "string") setCode(data.code);
        if (data.blocks && typeof data.blocks === "object")
          setBlocks(data.blocks);
      }
    } catch {
      /* Drafts are optional. */
    }
    setReady(true);
    return () => {
      generation.current++;
    };
  }, [task.id, draftOwner]);
  useEffect(() => {
    generation.current++;
    setRunning(false);
    setResult(null);
    setFrameIndex(0);
    setSaved(false);
  }, [source, task.id]);
  async function run() {
    const current = ++generation.current;
    const evaluated = evaluateCode(source, task.world);
    setResult(evaluated);
    setFrameIndex(0);
    setRunning(true);
    for (let i = 1; i < evaluated.frames.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (current !== generation.current) return;
      setFrameIndex(i);
    }
    setRunning(false);
  }
  function step() {
    generation.current++;
    setRunning(false);
    if (!result) {
      setResult(evaluateCode(source, task.world));
      setFrameIndex(1);
    } else setFrameIndex((i) => Math.min(i + 1, result.frames.length - 1));
  }
  function reset() {
    generation.current++;
    setRunning(false);
    setResult(null);
    setFrameIndex(0);
  }
  async function submit() {
    if (!canUseCloud) {
      onNotice(
        "Войдите для проверки решения и сохранения результата. Запуск программы доступен без аккаунта.",
      );
      onRequireAuth();
      return;
    }
    setBusy(true);
    try {
      const data = await api<{ result: RunResult }>("/submissions", {
        taskId: task.id,
        code: source,
      });
      setResult(data.result);
      setFrameIndex(data.result.frames.length - 1);
      onNotice(
        data.result.success
          ? "Решение проверено сервером и сохранено."
          : `Решение требует доработки: ${data.result.message}`,
      );
    } catch (e) {
      onNotice(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }
  async function requestHint() {
    if (!canUseCloud) {
      onNotice(
        "Войдите для получения подсказки. Справочник команд доступен без аккаунта.",
      );
      onRequireAuth();
      return;
    }
    setBusy(true);
    try {
      const data = await api<{ hint: string; source: string }>("/hints", {
        code: source,
        taskId: task.id,
      });
      setHint(
        `${data.source === "local" ? "Подсказка без AI" : "AI-подсказка"}: ${data.hint}`,
      );
    } catch (e) {
      onNotice(e instanceof Error ? e.message : "Подсказка недоступна");
    } finally {
      setBusy(false);
    }
  }
  const frame: Frame = result?.frames[
    Math.min(frameIndex, result.frames.length - 1)
  ] || { ...task.world.start, command: "Старт" };
  const finished = result && !running && frameIndex >= result.frames.length - 1;
  return (
    <div className="practice-page page-container">
      <div className="page-heading">
        <div>
          <span className="eyebrow">ПРАКТИКА ПРОГРАММИРОВАНИЯ</span>
          <h1>Практическая среда</h1>
          <p>Создание программ из блоков и кода с проверкой в симуляторе.</p>
        </div>
        <button
          className="secondary-button"
          onClick={() => setShowHelp(!showHelp)}
        >
          <HelpCircle size={16} />
          Команды
        </button>
      </div>
      <section className="mission-card">
        <span className="mission-icon">
          <Flag size={22} />
        </span>
        <div>
          <div className="mission-label">
            ЗАДАНИЕ <span>·</span>{" "}
            {task.difficulty === "easy"
              ? "Начальный уровень"
              : task.difficulty === "medium"
                ? "Средний уровень"
                : "Продвинутый уровень"}
          </div>
          <h2>{task.title}</h2>
          <p>{task.description}</p>
        </div>
        <span className="mission-mode">
          {task.class_id ? "Задание учителя" : "Тренировочное задание"}
        </span>
      </section>
      {showHelp && (
        <div className="help-panel">
          <h3>Справочник учебного Python</h3>
          <div>
            <code>robot.forward(3)</code>
            <span>Вперёд на 3 клетки</span>
            <code>robot.backward(1)</code>
            <span>Назад на 1 клетку</span>
            <code>robot.turn_left()</code>
            <span>Поворот налево на 90°</span>
            <code>robot.turn_right()</code>
            <span>Поворот направо на 90°</span>
            <code>robot.stop()</code>
            <span>Завершить программу</span>
            <code>for i in range(3):</code>
            <span>Повторить команды с отступом 3 раза</span>
            <code>if robot.obstacle_ahead():</code>
            <span>Проверить препятствие; поддерживается else</span>
          </div>
          <p>
            Это ограниченный учебный язык, а не полный Python. Ввод, библиотеки
            и произвольные выражения не поддерживаются.
          </p>
        </div>
      )}
      <div className="playground">
        <section className="editor-panel">
          <div className="panel-bar">
            <div className="tabs">
              <button
                className={mode === "blocks" ? "selected" : ""}
                onClick={() => setMode("blocks")}
              >
                <Layers3 size={15} />
                Блоки
              </button>
              <button
                className={mode === "code" ? "selected" : ""}
                onClick={() => setMode("code")}
              >
                <Code2 size={16} />
                Python
              </button>
            </div>
            <button
              className="icon-button"
              title="Сохранить черновик в этом браузере"
              aria-label="Сохранить черновик"
              onClick={() => {
                try {
                  localStorage.setItem(
                    `easycode:draft:${draftOwner}:${task.id}`,
                    JSON.stringify({ code, blocks }),
                  );
                  setSaved(true);
                  onNotice("Черновик сохранён в этом браузере.");
                } catch {
                  onNotice("Браузер не разрешил сохранить черновик.");
                }
              }}
            >
              {saved ? <Check size={16} /> : <Save size={16} />}
            </button>
          </div>
          <div className="editor-content">
            {mode === "blocks" ? (
              <Suspense
                fallback={<div className="empty-state">Загружаем блоки…</div>}
              >
                {ready && (
                  <BlockEditor
                    initialState={blocks}
                    onChange={(next, state) => {
                      setBlockCode(next);
                      setBlocks(state);
                    }}
                  />
                )}
              </Suspense>
            ) : (
              <div className="code-editor">
                <div className="code-filename">
                  <span className="tiny-dot" />
                  main.py<span>Учебный Python</span>
                </div>
                <div className="code-input-wrap">
                  <div className="line-numbers" aria-hidden="true">
                    {code.split("\n").map((_, i) => (
                      <span key={i}>{i + 1}</span>
                    ))}
                  </div>
                  <textarea
                    aria-label="Код программы"
                    value={code}
                    spellCheck={false}
                    onChange={(e) => setCode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Tab") {
                        e.preventDefault();
                        const el = e.currentTarget;
                        const start = el.selectionStart;
                        const end = el.selectionEnd;
                        setCode(
                          code.slice(0, start) + "    " + code.slice(end),
                        );
                        requestAnimationFrame(() => {
                          el.selectionStart = el.selectionEnd = start + 4;
                        });
                      }
                    }}
                  />
                </div>
              </div>
            )}
          </div>
          <div className="editor-bottom">
            <span>
              {mode === "blocks"
                ? "Соединяйте блоки для составления программы"
                : "Отступ внутри цикла — 4 пробела"}
            </span>
            {mode === "blocks" && (
              <button
                className="text-button"
                onClick={() => {
                  if (
                    code !== starter &&
                    code !== blockCode &&
                    !window.confirm(
                      "Заменить текст программы кодом из блоков? Текущие изменения в Python будут заменены.",
                    )
                  )
                    return;
                  setCode(blockCode);
                  setMode("code");
                }}
              >
                В код <ArrowRight size={13} />
              </button>
            )}
          </div>
        </section>
        <section className="scene-panel">
          <div className="panel-bar">
            <span className="panel-title">
              <span className="status-dot" />
              Симуляция
            </span>
            <span className="scene-dimensions">
              {task.world.width} × {task.world.height}
            </span>
          </div>
          <div className="scene-content">
            <Board
              world={task.world}
              frame={frame}
              frames={result?.frames.slice(0, frameIndex + 1) || []}
            />
            <div className="scene-legend">
              <span>
                <i className="legend-start" />
                Старт
              </span>
              <span>
                <i className="legend-goal" />
                Цель
              </span>
              <span>
                <i className="legend-obstacle" />
                Препятствие
              </span>
            </div>
          </div>
          <div className="scene-status">
            <span className={finished && result.success ? "success-text" : ""}>
              {running
                ? "Выполнение команд…"
                : finished
                  ? result.message
                  : "Симулятор готов к запуску"}
            </span>
            <code>
              x: {frame.x} · y: {frame.y}
            </code>
          </div>
        </section>
      </div>
      <div className="run-toolbar">
        <div>
          <button
            className="primary-button"
            onClick={
              running
                ? () => {
                    generation.current++;
                    setRunning(false);
                  }
                : run
            }
          >
            {running ? (
              <Square size={15} />
            ) : (
              <Play size={15} fill="currentColor" />
            )}
            {running ? "Остановить" : "Запустить"}
          </button>
          <button
            className="secondary-button"
            onClick={step}
            disabled={running}
          >
            <StepForward size={16} />
            По шагам
          </button>
          <button
            className="icon-button"
            aria-label="Сбросить симуляцию"
            title="Сбросить симуляцию"
            onClick={reset}
          >
            <RotateCcw size={17} />
          </button>
        </div>
        <button
          className="secondary-button submit-button"
          onClick={submit}
          disabled={busy || running}
        >
          <Check size={16} />
          {busy ? "Проверяем…" : "Проверить решение"}
        </button>
      </div>
      <div className="practice-bottom">
        <section className="console-panel">
          <h3>
            <Terminal size={16} />
            Журнал программы
            <span>{result ? `${result.steps} шагов` : "Ожидание"}</span>
          </h3>
          <div className="console-lines">
            {result?.frames.length ? (
              result.frames
                .slice(0, Math.min(frameIndex + 1, result.frames.length))
                .map((f, i) => (
                  <div key={i}>
                    <span>{String(i).padStart(2, "0")}</span>
                    <code>{f.command}</code>
                    <small>
                      ({f.x}, {f.y})
                    </small>
                  </div>
                ))
            ) : (
              <p>Нажмите «Запустить» для просмотра выполнения команд.</p>
            )}
            {result && !running && (
              <p
                className={result.success ? "success-text" : "console-message"}
              >
                {result.message}
              </p>
            )}
          </div>
        </section>
        <section className="hint-card">
          <span className="hint-icon">
            <HelpCircle size={20} />
          </span>
          <h3>Помощь с заданием</h3>
          <p>
            {hint ||
              "Получите пояснение к текущему решению и рекомендации по следующему шагу."}
          </p>
          <button className="text-button" onClick={requestHint} disabled={busy}>
            Получить подсказку <ChevronRight size={16} />
          </button>
          <small>
            {canUseCloud
              ? "AI включится после настройки ключа и модели."
              : "Подсказки доступны после входа. Практиковаться можно без аккаунта."}
          </small>
        </section>
      </div>
    </div>
  );
}
function Board({
  world,
  frame,
  frames,
}: {
  world: World;
  frame: Frame;
  frames: Frame[];
}) {
  const rotation = { east: 0, south: 90, west: 180, north: 270 }[
    frame.direction
  ];
  return (
    <div
      className="world-board"
      style={{
        aspectRatio: `${world.width}/${world.height}`,
        gridTemplateColumns: `repeat(${world.width},1fr)`,
        gridTemplateRows: `repeat(${world.height},1fr)`,
      }}
      aria-label={`Машина в клетке ${frame.x}, ${frame.y}. Цель ${world.goal.x}, ${world.goal.y}.`}
    >
      {Array.from({ length: world.width * world.height }, (_, i) => {
        const x = i % world.width,
          y = Math.floor(i / world.width);
        const obstacle = world.obstacles.some((p) => p.x === x && p.y === y);
        const goal = world.goal.x === x && world.goal.y === y;
        const start = world.start.x === x && world.start.y === y;
        const trail = frames.some((f) => f.x === x && f.y === y);
        return (
          <div
            key={i}
            className={`world-cell ${obstacle ? "obstacle" : ""} ${goal ? "goal" : ""} ${start ? "start" : ""} ${trail ? "trail" : ""}`}
          >
            {goal ? (
              <Flag size={20} />
            ) : obstacle ? (
              <span />
            ) : start ? (
              <i />
            ) : null}
          </div>
        );
      })}
      <div
        className="simulation-car"
        style={{
          width: `${100 / world.width}%`,
          height: `${100 / world.height}%`,
          left: `${(frame.x * 100) / world.width}%`,
          top: `${(frame.y * 100) / world.height}%`,
        }}
      >
        <svg
          viewBox="0 0 64 64"
          style={{ transform: `rotate(${rotation}deg)` }}
          aria-hidden="true"
        >
          <rect x="16" y="9" width="12" height="9" rx="3" fill="#08060c" />
          <rect x="38" y="9" width="12" height="9" rx="3" fill="#08060c" />
          <rect x="16" y="46" width="12" height="9" rx="3" fill="#08060c" />
          <rect x="38" y="46" width="12" height="9" rx="3" fill="#08060c" />
          <rect
            x="10"
            y="15"
            width="45"
            height="34"
            rx="12"
            fill="#b66cf8"
            stroke="#e1bbff"
            strokeWidth="1.3"
          />
          <path d="M35 19h9q6 0 6 7v12q0 7-6 7h-9z" fill="#362444" />
          <path d="M37 23h6q3 0 3 3v12q0 3-3 3h-6z" fill="#b9dcf0" />
          <rect x="15" y="21" width="12" height="22" rx="4" fill="#9e46ed" />
          <rect x="51" y="21" width="5" height="7" rx="2" fill="#fff2bf" />
          <rect x="51" y="36" width="5" height="7" rx="2" fill="#fff2bf" />
        </svg>
      </div>
    </div>
  );
}
