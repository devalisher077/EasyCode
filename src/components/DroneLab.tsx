import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  Play,
  Square,
  RotateCcw,
  StepForward,
  Save,
  Crosshair,
  Check,
  Box,
} from "lucide-react";
import {
  droneMissions,
  droneStarter,
  droneBlocks,
  evaluateDrone,
  initialDrone,
  type DroneMission,
  type DroneResult,
} from "../../shared/drone";
import { blockProgram } from "../../shared/block-program";
import { t } from "../lib/i18n";
import DroneScene from "./DroneScene";
import "./drone-lab.css";
const BlockEditor = lazy(() => import("./BlockEditor"));

function readDraft(key: string) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw || raw.length > 64000) return {};
    const value = JSON.parse(raw);
    const blocks = value.blocks
      ? blockProgram(value.blocks, "drone")
      : undefined;
    return {
      code:
        typeof value.code === "string" && value.code.length <= 12000
          ? value.code
          : undefined,
      blocks: blocks?.state,
      blockCode: blocks?.code,
      mode: value.mode === "code" ? ("code" as const) : ("blocks" as const),
    };
  } catch {
    return {};
  }
}

export default function DroneLab({
  draftOwner,
  onNotice,
}: {
  draftOwner: string;
  onNotice: (message: string) => void;
}) {
  const [missionId, setMissionId] = useState(droneMissions[0].id);
  const mission = droneMissions.find((m) => m.id === missionId)!;
  return (
    <div className="page-container drone-lab">
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t("ВИРТУАЛЬНАЯ ЛАБОРАТОРИЯ")}</span>
          <h1>{t("3D-лаборатория")}</h1>
          <p>
            {t("Запрограммируйте полёт. Исследуйте маршрут в трёх измерениях.")}
          </p>
        </div>
        <span className="drone-badge">
          <Box size={16} />
          {t("Учебный симулятор")}
        </span>
      </div>
      <div className="drone-missions" aria-label={t("Миссии дрона")}>
        {droneMissions.map((m, i) => (
          <button
            key={m.id}
            aria-pressed={m.id === missionId}
            onClick={() => setMissionId(m.id)}
          >
            <span>0{i + 1}</span>
            {t(m.title)}
          </button>
        ))}
      </div>
      <DroneWorkspace
        key={`${draftOwner}:${missionId}`}
        mission={mission}
        draftOwner={draftOwner}
        onNotice={onNotice}
      />
    </div>
  );
}

function DroneWorkspace({
  mission,
  draftOwner,
  onNotice,
}: {
  mission: DroneMission;
  draftOwner: string;
  onNotice: (message: string) => void;
}) {
  const draftKey = `easycode:drone:v1:${draftOwner}:${mission.id}`;
  const [draft] = useState(() => readDraft(draftKey));
  const [mode, setMode] = useState<"blocks" | "code">(draft.mode || "blocks");
  const [code, setCode] = useState(draft.code ?? droneStarter);
  const [blocks, setBlocks] = useState<object>(draft.blocks ?? droneBlocks);
  const [blockCode, setBlockCode] = useState(draft.blockCode ?? droneStarter);
  const [result, setResult] = useState<DroneResult | null>(null);
  const [index, setIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [cameraView, setCameraView] = useState(0);
  const [saved, setSaved] = useState(false);
  const source = mode === "code" ? code : blockCode;
  useEffect(() => {
    setRunning(false);
    setResult(null);
    setIndex(0);
  }, [source]);
  useEffect(() => {
    setSaved(false);
  }, [code, blocks, mode]);
  useEffect(() => {
    if (!running || !result) return;
    if (index >= result.frames.length - 1) {
      setRunning(false);
      return;
    }
    const timer = setTimeout(() => setIndex((i) => i + 1), 450);
    return () => clearTimeout(timer);
  }, [running, index, result]);
  const frame = result?.frames[index] ?? initialDrone(mission);
  const trail = useMemo(
    () => result?.frames.slice(0, index + 1) ?? [initialDrone(mission)],
    [result, index, mission],
  );
  const finished = result && index === result.frames.length - 1 && !running;
  function reset() {
    setRunning(false);
    setResult(null);
    setIndex(0);
  }
  function run() {
    const next = evaluateDrone(source, mission);
    setResult(next);
    setIndex(0);
    setRunning(true);
  }
  function step() {
    setRunning(false);
    if (!result) {
      const next = evaluateDrone(source, mission);
      setResult(next);
      setIndex(Math.min(1, next.frames.length - 1));
    } else setIndex((i) => Math.min(i + 1, result.frames.length - 1));
  }
  function save() {
    try {
      localStorage.setItem(draftKey, JSON.stringify({ code, blocks, mode }));
      setSaved(true);
    } catch {
      onNotice(t("Не удалось сохранить черновик в браузере."));
    }
  }
  return (
    <>
      <div className="drone-brief">
        <div>
          <h2>{t(mission.title)}</h2>
          <p>{t(mission.description)}</p>
        </div>
        <span>8 × 8 × 5</span>
      </div>
      <div className="drone-layout">
        <section className="drone-viewport" aria-label={t("Полёт дрона")}>
          <div className="drone-scene-toolbar">
            <span>
              <i />
              {t("Полёт дрона")}
            </span>
            <button
              onClick={() => setCameraView((v) => v + 1)}
              aria-label={t("Вернуть камеру")}
              title={t("Вернуть камеру")}
            >
              <Crosshair size={17} />
            </button>
          </div>
          <DroneScene
            mission={mission}
            frame={frame}
            trail={trail}
            cameraView={cameraView}
          />
          <div className="drone-telemetry">
            <div>
              <span>{t("Координаты")}</span>
              <strong>
                X {frame.x} / Z {frame.z}
              </strong>
            </div>
            <div>
              <span>{t("Высота")}</span>
              <strong>{frame.y} / 5</strong>
            </div>
            <div>
              <span>{t("Заряд")}</span>
              <strong>{frame.battery}%</strong>
            </div>
            <div>
              <span>{t("Контрольные точки")}</span>
              <strong>
                {frame.visited.length} / {mission.checkpoints.length}
              </strong>
            </div>
          </div>
          <div className="drone-legend">
            <span>
              <i style={{ background: "#367f78" }} />
              {t("Старт")}
            </span>
            <span>
              <i style={{ background: "#347fe0" }} />
              {t("Посадка")}
            </span>
            <span>
              <i style={{ background: "#f0aa59" }} />
              {t("Препятствия / груз")}
            </span>
          </div>
          <p className="drone-camera-help">
            {t(
              "Перетаскивайте сцену для вращения, прокручивайте для масштаба.",
            )}
          </p>
          <div
            className={`drone-flight-status ${finished ? (result.success ? "success" : "warning") : ""}`}
            role="status"
          >
            {finished ? (
              <>
                {result.errorLine ? `${t("Строка")} ${result.errorLine}: ` : ""}
                {t(result.message)}
              </>
            ) : running ? (
              t("Выполняется полёт…")
            ) : (
              t("Готов к запуску")
            )}
            <code>{frame.command || "drone.takeoff()"}</code>
          </div>
        </section>
        <section className="drone-editor" aria-label={t("Программа дрона")}>
          <div className="drone-editor-tabs">
            <button
              aria-pressed={mode === "blocks"}
              onClick={() => setMode("blocks")}
            >
              {t("Блоки")}
            </button>
            <button
              aria-pressed={mode === "code"}
              onClick={() => setMode("code")}
            >
              {t("Код")}
            </button>
            {mode === "blocks" && (
              <button
                className="drone-to-code"
                onClick={() => {
                  setCode(blockCode);
                  setMode("code");
                }}
              >
                {t("В код")}
              </button>
            )}
          </div>
          {mode === "blocks" ? (
            <Suspense fallback={<p>{t("Загружаем лабораторию…")}</p>}>
              <div className="drone-block-workspace">
                <BlockEditor
                  variant="drone"
                  initialState={blocks}
                  onChange={(next, state) => {
                    setBlockCode(next);
                    setBlocks(state);
                  }}
                />
              </div>
            </Suspense>
          ) : (
            <textarea
              aria-label={t("Код программы дрона")}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              spellCheck={false}
              maxLength={12000}
            />
          )}
          <div className="drone-actions">
            <button className="primary" onClick={run} disabled={running}>
              <Play size={16} />
              {t("Запустить")}
            </button>
            <button
              onClick={() => setRunning(false)}
              disabled={!running}
              aria-label={t("Остановить")}
              title={t("Остановить")}
            >
              <Square size={16} />
            </button>
            <button
              onClick={step}
              disabled={running}
              aria-label={t("Шаг")}
              title={t("Шаг")}
            >
              <StepForward size={16} />
            </button>
            <button
              onClick={reset}
              aria-label={t("Сбросить")}
              title={t("Сбросить")}
            >
              <RotateCcw size={16} />
            </button>
            <button
              onClick={save}
              aria-label={t("Сохранить черновик")}
              title={t("Сохранить черновик")}
            >
              {saved ? <Check size={16} /> : <Save size={16} />}
            </button>
          </div>
          <p className="drone-local-note" role="status">
            {t(
              saved
                ? "Черновик сохранён в этом браузере."
                : "Свободная практика. Черновик сохраняется кнопкой в этом браузере; в журнал курса результат не отправляется.",
            )}
          </p>
        </section>
      </div>
      <details className="drone-reference">
        <summary>{t("Команды дрона и правила полёта")}</summary>
        <p>
          {t(
            "Направление на старте — +X. Поворот направо меняет его на +Z. Одна клетка — одна учебная единица. Взлёт поднимает на высоту 1. Каждый шаг расходует 2% заряда.",
          )}
        </p>
        <div>
          {[
            ["drone.takeoff() / drone.land()", "Взлёт и посадка"],
            ["drone.forward(3)", "Вперёд на 3 клетки"],
            ["drone.up(2) / drone.down(1)", "Изменение высоты"],
            [
              "drone.turn_left() / drone.turn_right()",
              "Поворот на 90 градусов",
            ],
            [
              "drone.pickup() / drone.drop()",
              "Забрать или выгрузить груз на земле",
            ],
            ["for i in range(3):", "Цикл: команды внутри с отступом 4 пробела"],
          ].map(([command, label]) => (
            <p key={command}>
              <code>{command}</code>
              <span>{t(label)}</span>
            </p>
          ))}
        </div>
        <p>
          {t(
            "Это учебный язык с ограниченными командами, не полный Python и не управление реальным дроном. Аэродинамика и ветер не моделируются.",
          )}
        </p>
      </details>
    </>
  );
}
