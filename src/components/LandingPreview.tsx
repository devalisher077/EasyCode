import { t } from "../lib/i18n";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Braces,
  Check,
  Flag,
  Layers3,
  Play,
  RotateCcw,
} from "lucide-react";
import {
  DEFAULT_WORLD,
  evaluateCode,
  type Frame,
  type RunResult,
} from "../../shared/simulator";
import "./landing-preview.css";

const angles = { east: 0, south: 90, west: 180, north: -90 };
const initialFrame: Frame = { ...DEFAULT_WORLD.start, command: "Старт" };

export function LandingPreview({ onTry }: { onTry: () => void }) {
  const [mode, setMode] = useState<"python" | "blocks">("python");
  const [steps, setSteps] = useState(5);
  const [frame, setFrame] = useState<Frame>(initialFrame);
  const [result, setResult] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) clearInterval(timer.current);
    },
    [],
  );

  function reset() {
    if (timer.current !== null) clearInterval(timer.current);
    timer.current = null;
    setFrame(initialFrame);
    setRunning(false);
    setResult(null);
  }

  function run() {
    reset();
    const next = evaluateCode(
      `robot.forward(${steps})\nrobot.turn_left()\nrobot.forward(3)`,
      DEFAULT_WORLD,
    );
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setFrame(next.frames.at(-1) ?? initialFrame);
      setResult(next);
      return;
    }
    setRunning(true);
    let index = 0;
    timer.current = setInterval(() => {
      index += 1;
      setFrame(next.frames[index] ?? initialFrame);
      if (index >= next.frames.length - 1) {
        if (timer.current !== null) clearInterval(timer.current);
        timer.current = null;
        setRunning(false);
        setResult(next);
      }
    }, 240);
  }

  const stepSelect = (
    <select
      className="lp-preview-step"
      aria-label={t("Количество шагов вперёд")}
      value={steps}
      disabled={running}
      onChange={(event) => {
        setSteps(Number(event.target.value));
        reset();
      }}
    >
      {t(
        [1, 2, 3, 4, 5].map((value) => (
          <option key={value} value={value}>
            {t(value)}
          </option>
        )),
      )}
    </select>
  );

  return (
    <section
      className="lp-preview"
      aria-label={t("Интерактивная демонстрация программирования")}
    >
      <div className="lp-preview-windowbar">
        <span className="lp-preview-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="lp-preview-filename">route.py</span>
        <span className="lp-preview-demo">{t("Демонстрация")}</span>
      </div>

      <div className="lp-preview-tabs" aria-label={t("Вид программы")}>
        <button
          type="button"
          className={mode === "blocks" ? "is-active" : ""}
          aria-pressed={mode === "blocks"}
          onClick={() => setMode("blocks")}
        >
          <Layers3 size={13} />
          {t(" Блоки")}
        </button>
        <button
          type="button"
          className={mode === "python" ? "is-active" : ""}
          aria-pressed={mode === "python"}
          onClick={() => setMode("python")}
        >
          <Braces size={13} /> Python
        </button>
        <span>{t("Два режима программирования")}</span>
      </div>

      <div className={`lp-preview-editor lp-preview-editor--${mode}`}>
        {t(
          mode === "python" ? (
            <div
              className="lp-preview-code"
              aria-label={t("Учебная программа Python")}
            >
              <div>
                <span className="lp-preview-line">1</span>
                <span className="lp-preview-comment">
                  {t("# Маршрут к целевой точке")}
                </span>
              </div>
              <div>
                <span className="lp-preview-line">2</span>
                <span className="lp-preview-comment">
                  {t("# Движение и поворот налево")}
                </span>
              </div>
              <div>
                <span className="lp-preview-line">3</span>
                <span aria-hidden="true">&nbsp;</span>
              </div>
              <div>
                <span className="lp-preview-line">4</span>
                <span className="lp-preview-object">robot</span>
                <span>.</span>
                <span className="lp-preview-method">forward</span>
                <span>(</span>
                {t(stepSelect)}
                <span>)</span>
              </div>
              <div>
                <span className="lp-preview-line">5</span>
                <span className="lp-preview-object">robot</span>
                <span>.</span>
                <span className="lp-preview-method">turn_left</span>
                <span>()</span>
              </div>
              <div>
                <span className="lp-preview-line">6</span>
                <span className="lp-preview-object">robot</span>
                <span>.</span>
                <span className="lp-preview-method">forward</span>
                <span>(</span>
                <span className="lp-preview-number">3</span>
                <span>)</span>
              </div>
              <div>
                <span className="lp-preview-line">7</span>
                <span aria-hidden="true">&nbsp;</span>
              </div>
              <div>
                <span className="lp-preview-line">8</span>
                <span className="lp-preview-comment">
                  {t("# Нажмите «Запустить»")}
                </span>
              </div>
            </div>
          ) : (
            <div
              className="lp-preview-blocks"
              aria-label={t("Та же программа из трёх блоков")}
            >
              <div className="lp-preview-block lp-preview-block--start">
                <Play size={12} fill="currentColor" />
                {t(" Когда нажата кнопка запуска")}
              </div>
              <div className="lp-preview-block">
                {t("Двигаться вперёд ")}
                {t(stepSelect)}
                {t(" шагов")}
              </div>
              <div className="lp-preview-block">
                {t("Повернуть налево ")}
                <span>90°</span>
              </div>
              <div className="lp-preview-block">
                {t("Двигаться вперёд ")}
                <span>3</span>
                {t(" шага")}
              </div>
            </div>
          ),
        )}
      </div>

      <div className="lp-preview-scene">
        <div
          className="lp-preview-world"
          role="img"
          aria-label={t(
            `Поле 8 на 6. Машина: столбец ${frame.x + 1}, строка ${frame.y + 1}. Финиш: столбец 7, строка 2.`,
          )}
        >
          {t(
            Array.from({ length: 48 }, (_, index) => {
              const x = index % 8;
              const y = Math.floor(index / 8);
              const obstacle = DEFAULT_WORLD.obstacles.some(
                (item) => item.x === x && item.y === y,
              );
              const goal =
                DEFAULT_WORLD.goal.x === x && DEFAULT_WORLD.goal.y === y;
              const route =
                (y === 4 && x >= 1 && x <= 6) || (x === 6 && y >= 1 && y <= 4);
              return (
                <span
                  key={index}
                  className={`lp-preview-cell${obstacle ? " is-obstacle" : ""}${goal ? " is-goal" : ""}${route ? " is-route" : ""}`}
                >
                  {t(goal && <Flag size={13} />)}
                </span>
              );
            }),
          )}
          <div
            className="lp-preview-car-position"
            style={{
              left: `${frame.x * 12.5}%`,
              top: `${frame.y * (100 / 6)}%`,
            }}
          >
            <svg
              className="lp-preview-car"
              viewBox="0 0 36 28"
              style={{ transform: `rotate(${angles[frame.direction]}deg)` }}
              aria-hidden="true"
            >
              <rect x="7" y="2" width="7" height="5" rx="2" fill="#0a1017" />
              <rect x="24" y="2" width="7" height="5" rx="2" fill="#0a1017" />
              <rect x="7" y="21" width="7" height="5" rx="2" fill="#0a1017" />
              <rect x="24" y="21" width="7" height="5" rx="2" fill="#0a1017" />
              <rect
                x="3"
                y="5"
                width="30"
                height="18"
                rx="6"
                fill="#88c0ff"
                stroke="#d4e8ff"
                strokeWidth="1"
              />
              <rect x="12" y="7" width="10" height="14" rx="3" fill="#243f5e" />
              <path d="M22 8 26 10v8l-4 2Z" fill="#d6e9ff" opacity=".85" />
              <rect x="30" y="8" width="3" height="4" rx="1" fill="#fff5c6" />
              <rect x="30" y="16" width="3" height="4" rx="1" fill="#fff5c6" />
            </svg>
          </div>
        </div>
        <div className="lp-preview-mission">
          <span className="lp-preview-mission-label">
            {t("УЧЕБНОЕ ЗАДАНИЕ")}
          </span>
          <strong>
            {t("Управление")}
            <br />
            {t("движением")}
          </strong>
          <p>
            {t("Укажите число шагов, чтобы машина достигла целевой точки.")}
          </p>
          <span
            className={`lp-preview-status${result?.success ? " is-success" : ""}`}
            role="status"
            aria-live="polite"
          >
            {t(
              running ? (
                "Программа выполняется…"
              ) : result?.success ? (
                <>
                  <Check size={12} />
                  {t(" Целевая точка достигнута")}
                </>
              ) : result ? (
                "Измените число шагов"
              ) : (
                "Готово к запуску"
              ),
            )}
          </span>
        </div>
      </div>

      <div className="lp-preview-footer">
        <button
          type="button"
          className="lp-preview-run"
          onClick={run}
          disabled={running}
        >
          {t(
            result ? (
              <RotateCcw size={14} />
            ) : (
              <Play size={13} fill="currentColor" />
            ),
          )}
          {t(running ? "Выполняется…" : result ? "Повторить" : "Запустить")}
        </button>
        <button type="button" className="lp-preview-open" onClick={onTry}>
          {t("Открыть редактор ")}
          <ArrowRight size={14} />
        </button>
      </div>
    </section>
  );
}
