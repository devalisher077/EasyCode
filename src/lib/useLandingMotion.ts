import { useEffect, useState, type RefObject } from "react";

const storageKey = "easycode:landing-motion";
const reducedQuery = "(prefers-reduced-motion: reduce)";

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(reducedQuery).matches
  );
}

/** Decorative motion only: user-triggered simulator playback is independent. */
export function useLandingMotion(
  rootRef: RefObject<HTMLDivElement | null>,
  suspended = false,
) {
  const [paused, setPaused] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === "off";
    } catch {
      return false;
    }
  });
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  const [hidden, setHidden] = useState(
    () => typeof document !== "undefined" && document.hidden,
  );
  const enabled = !paused && !reducedMotion && !suspended && !hidden;

  useEffect(() => {
    const media = window.matchMedia?.(reducedQuery);
    const update = () => setReducedMotion(Boolean(media?.matches));
    const visibility = () => setHidden(document.hidden);
    media?.addEventListener("change", update);
    document.addEventListener("visibilitychange", visibility);
    update();
    return () => {
      media?.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const elements = root.querySelectorAll<HTMLElement>(
      "[data-reveal], [data-loop]",
    );
    const reveal = (element: HTMLElement) => {
      element.classList.remove("lp-reveal-pending");
      element.classList.add("lp-revealed");
    };
    if (!enabled || typeof IntersectionObserver === "undefined") {
      elements.forEach(reveal);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const element = entry.target as HTMLElement;
          element.dataset.inView = String(entry.isIntersecting);
          if (entry.isIntersecting) reveal(element);
        }
      },
      { threshold: 0.08 },
    );
    elements.forEach((element) => {
      // Content is visible by default; only offscreen sections opt into reveal.
      if (
        element.hasAttribute("data-reveal") &&
        !element.classList.contains("lp-revealed")
      ) {
        if (element.getBoundingClientRect().top >= window.innerHeight)
          element.classList.add("lp-reveal-pending");
        else reveal(element);
      }
      observer.observe(element);
    });
    const focus = (event: FocusEvent) => {
      if (!(event.target instanceof Element)) return;
      const section = event.target.closest<HTMLElement>("[data-reveal]");
      if (section) reveal(section);
    };
    root.addEventListener("focusin", focus);
    return () => {
      observer.disconnect();
      root.removeEventListener("focusin", focus);
      elements.forEach((element) =>
        element.classList.remove("lp-reveal-pending"),
      );
    };
  }, [rootRef, enabled]);

  useEffect(() => {
    const root = rootRef.current;
    const finePointer = window.matchMedia?.(
      "(hover: hover) and (pointer: fine)",
    );
    if (!root || !enabled || !finePointer?.matches) return;
    let frame = 0;
    let target: HTMLElement | null = null;
    let clientX = 0;
    let clientY = 0;
    const clear = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      target?.removeAttribute("data-pointer-active");
      target?.style.removeProperty("--tilt-x");
      target?.style.removeProperty("--tilt-y");
      target = null;
    };
    const move = (event: PointerEvent) => {
      if (
        !finePointer.matches ||
        event.pointerType === "touch" ||
        !(event.target instanceof Element)
      )
        return;
      const next = event.target.closest<HTMLElement>("[data-spotlight]");
      if (next !== target) {
        clear();
        target = next;
      }
      if (!target) return;
      clientX = event.clientX;
      clientY = event.clientY;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!target) return;
        const rect = target.getBoundingClientRect();
        const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
        const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
        target.style.setProperty("--spot-x", `${x}px`);
        target.style.setProperty("--spot-y", `${y}px`);
        target.style.setProperty(
          "--tilt-x",
          `${-(y / Math.max(rect.height, 1) - 0.5) * 5}deg`,
        );
        target.style.setProperty(
          "--tilt-y",
          `${(x / Math.max(rect.width, 1) - 0.5) * 5}deg`,
        );
        target.dataset.pointerActive = "true";
      });
    };
    const pointerMode = () => {
      if (!finePointer.matches) clear();
    };
    root.addEventListener("pointermove", move, { passive: true });
    root.addEventListener("pointerleave", clear);
    window.addEventListener("scroll", clear, { passive: true });
    finePointer.addEventListener("change", pointerMode);
    return () => {
      clear();
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerleave", clear);
      window.removeEventListener("scroll", clear);
      finePointer.removeEventListener("change", pointerMode);
    };
  }, [rootRef, enabled]);

  function toggle() {
    setPaused((previous) => {
      const next = !previous;
      try {
        localStorage.setItem(storageKey, next ? "off" : "on");
      } catch {
        /* In-memory preference still works. */
      }
      return next;
    });
  }
  return { enabled, paused, reducedMotion, toggle };
}
