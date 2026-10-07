import { useEffect, useRef } from "react";

type Props = { active: boolean };
type Point = { x: number; y: number };

const FRAME_INTERVAL = 1_000 / 30;

/** Decorative, local-only canvas. Motion preference and the pause switch belong to the parent. */
export function LandingAtmosphere({ active }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef(0);

  useEffect(() => {
    const candidate = canvasRef.current;
    if (!candidate || typeof window === "undefined") return;
    const canvas = candidate;

    let context: CanvasRenderingContext2D | null;
    try {
      context = canvas.getContext("2d", { alpha: true });
    } catch {
      return;
    }
    if (!context) return;
    const ctx = context;
    let width = 0;
    let height = 0;
    let pixelRatio = 1;
    let animationFrame: number | null = null;
    let lastPaint = 0;
    let visible = !document.hidden;
    let inViewport = false;
    let disposed = false;

    // Three continuous lanes distribute movement over the entire hero, not just its bottom edge.
    function pointAt(
      position: number,
      strand: number,
      phase: number,
      lane: number,
    ): Point {
      const wave = Math.sin(position * 5.8 + phase * 0.23 + lane * 1.75);
      const ripple = Math.sin(
        position * 9.2 - phase * 0.15 + strand * 0.85 + lane,
      );
      const spread =
        0.026 + Math.sin(position * 3.1 + phase * 0.11 + lane) * 0.009;
      return {
        x: width * position,
        y:
          height *
          (0.18 +
            lane * 0.32 +
            wave * 0.064 +
            ripple * 0.014 +
            strand * spread),
      };
    }

    function draw(phase: number) {
      if (disposed || !width || !height) return;
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      const narrow = width < 700;

      // Outlined squares cover every edge. Gentle offsets and alpha waves move the grid
      // continuously; no random flicker or repeating fade-to-black animation is involved.
      const cellSize = narrow ? 44 : 52;
      const columns = Math.ceil(width / cellSize) + 1;
      const rows = Math.ceil(height / cellSize) + 1;
      ctx.lineWidth = 0.7;
      for (let row = -1; row <= rows; row++) {
        for (let column = -1; column <= columns; column++) {
          const x = column * cellSize + Math.sin(phase * 0.17 + row * 0.21) * 5;
          const y = row * cellSize + Math.cos(phase * 0.13 + column * 0.18) * 5;
          const nx = x / width;
          const ny = y / height;
          const flowing =
            0.5 + Math.sin(nx * 5.4 + ny * 4.2 - phase * 0.25) * 0.5;
          const quietText = Math.exp(
            -Math.pow((nx - 0.25) / 0.3, 4) - Math.pow((ny - 0.39) / 0.28, 4),
          );
          const alpha = (0.055 + flowing * 0.057) * (1 - quietText * 0.42);
          ctx.strokeStyle = `rgba(179, 120, 225, ${alpha})`;
          ctx.strokeRect(x + 0.5, y + 0.5, cellSize - 1, cellSize - 1);
          if ((row * 13 + column * 7) % 23 === 0 && quietText < 0.3) {
            ctx.fillStyle = `rgba(160, 75, 235, ${0.012 + flowing * 0.026})`;
            ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
          }
        }
      }

      // Three wide washes drift with their own wave lanes, leaving the text readable.
      for (let lane = 0; lane < 3; lane++) {
        ctx.save();
        ctx.translate(
          width * (0.57 + Math.sin(phase * 0.075 + lane) * 0.09),
          height * (0.18 + lane * 0.32),
        );
        ctx.scale(width * 0.8, height * 0.26);
        const halo = ctx.createRadialGradient(0, 0, 0.04, 0, 0, 1);
        halo.addColorStop(0, "rgba(135, 46, 224, 0.074)");
        halo.addColorStop(0.5, "rgba(111, 36, 182, 0.032)");
        halo.addColorStop(1, "rgba(96, 28, 174, 0)");
        ctx.fillStyle = halo;
        ctx.fillRect(-1, -1, 2, 2);
        ctx.restore();
      }

      const strandsPerLane = narrow ? 5 : 7;
      const segments = narrow ? 66 : 96;
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (let lane = 0; lane < 3; lane++) {
        for (let index = 0; index < strandsPerLane; index++) {
          const strand = (index / (strandsPerLane - 1) - 0.5) * 2;
          const hue = 263 + lane * 7 + index * 1.5;
          const opacity =
            0.27 + Math.sin(index * 1.4 + phase * 0.13 + lane) * 0.045;
          const leftStrength = lane === 1 ? 0.3 : 0.63;
          const ink = ctx.createLinearGradient(0, 0, width, 0);
          ink.addColorStop(
            0,
            `hsla(${hue}, 95%, 69%, ${opacity * leftStrength})`,
          );
          ink.addColorStop(
            0.27,
            `hsla(${hue}, 95%, 69%, ${opacity * leftStrength})`,
          );
          ink.addColorStop(0.57, `hsla(${hue}, 96%, 73%, ${opacity * 0.75})`);
          ink.addColorStop(0.82, `hsla(${hue}, 98%, 77%, ${opacity})`);
          ink.addColorStop(1, `hsla(${hue}, 95%, 69%, ${opacity * 0.75})`);
          ctx.strokeStyle = ink;
          ctx.beginPath();
          for (let segment = 0; segment <= segments; segment++) {
            const point = pointAt(
              -0.06 + (segment / segments) * 1.12,
              strand,
              phase,
              lane,
            );
            if (segment === 0) ctx.moveTo(point.x, point.y);
            else ctx.lineTo(point.x, point.y);
          }
          // One soft wide trace, a midtone edge, then a fine core; no expensive blur filters.
          ctx.globalAlpha = 0.075;
          ctx.lineWidth = narrow ? 23 : 38;
          ctx.stroke();
          ctx.globalAlpha = 0.16;
          ctx.lineWidth = narrow ? 5 : 7;
          ctx.stroke();
          ctx.globalAlpha = 0.72;
          ctx.lineWidth = index % 3 === 0 ? 1.2 : 0.65;
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }

    function stop() {
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      animationFrame = null;
      lastPaint = 0;
    }

    function tick(timestamp: number) {
      animationFrame = null;
      if (disposed || !active || !visible || !inViewport) return;
      if (!lastPaint) lastPaint = timestamp;
      const elapsed = timestamp - lastPaint;
      if (elapsed >= FRAME_INTERVAL) {
        phaseRef.current +=
          Math.min(elapsed - (elapsed % FRAME_INTERVAL), 80) / 1_000;
        lastPaint = timestamp - (elapsed % FRAME_INTERVAL);
        draw(phaseRef.current);
      }
      animationFrame = window.requestAnimationFrame(tick);
    }

    function synchronize() {
      if (disposed || !active || !visible || !inViewport || !width || !height) {
        stop();
      } else if (
        animationFrame === null &&
        typeof window.requestAnimationFrame === "function"
      ) {
        lastPaint = 0;
        animationFrame = window.requestAnimationFrame(tick);
      }
    }

    function resize() {
      if (disposed) return;
      const rectangle = canvas.getBoundingClientRect();
      const nextWidth = Math.max(0, rectangle.width);
      const nextHeight = Math.max(0, rectangle.height);
      const nextRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      if (
        width === nextWidth &&
        height === nextHeight &&
        pixelRatio === nextRatio
      )
        return;
      width = nextWidth;
      height = nextHeight;
      pixelRatio = nextRatio;
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      inViewport = rectangle.bottom > 0 && rectangle.top < window.innerHeight;
      draw(phaseRef.current);
      synchronize();
    }

    function onVisibility() {
      visible = !document.hidden;
      synchronize();
    }

    resize();
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    resizeObserver?.observe(canvas);
    if (!resizeObserver)
      window.addEventListener("resize", resize, { passive: true });
    const intersectionObserver =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            ([entry]) => {
              inViewport = Boolean(entry?.isIntersecting);
              synchronize();
            },
            { threshold: 0 },
          );
    intersectionObserver?.observe(canvas);
    // Older browsers still stop when scrolling the hero out of the viewport.
    function onScroll() {
      const rectangle = canvas.getBoundingClientRect();
      inViewport = rectangle.bottom > 0 && rectangle.top < window.innerHeight;
      synchronize();
    }
    if (!intersectionObserver)
      window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disposed = true;
      stop();
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      className="lp-energy-canvas"
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        display: "block",
        pointerEvents: "none",
      }}
    />
  );
}
