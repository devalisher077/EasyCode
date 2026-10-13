import { t } from "../lib/i18n";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDownToLine,
  ChevronLeft,
  ChevronRight,
  Expand,
  LoaderCircle,
  Maximize,
  Minimize,
  RotateCcw,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
  type PDFDocumentLoadingTask,
  type RenderTask,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { loadMaterialPreview } from "../lib/api";
import { useDialog } from "../lib/useDialog";
import type { Material } from "../lib/types";
import "./presentation-viewer.css";

GlobalWorkerOptions.workerSrc = workerUrl;

type Props = {
  material: Material;
  ownerId: string;
  demo: boolean;
  onClose: () => void;
  onDownload: () => void;
};

export function PresentationViewer({
  material,
  ownerId,
  demo,
  onClose,
  onDownload,
}: Props) {
  const labelId = useId();
  const noteId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [loadError, setLoadError] = useState("");
  const [pageError, setPageError] = useState("");
  const [retry, setRetry] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(800);
  const [height, setHeight] = useState(450);
  const [rendering, setRendering] = useState(false);
  const [text, setText] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const title =
    material.path
      .split("/")
      .at(-1)
      ?.replace(/\.pptx?$/i, "") || "Презентация";

  // The portal and dialog are mounted synchronously, before this hook's effect.
  useDialog(true, onClose, dialogRef);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = dialogRef.current;
    return () => {
      document.body.style.overflow = previousOverflow;
      if (document.fullscreenElement === dialog)
        void document.exitFullscreen?.().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const abort = new AbortController();
    let loadingTask: PDFDocumentLoadingTask | undefined;
    setPdf(null);
    setLoadError("");
    setPageError("");
    setPage(1);
    setText("");
    setZoom(1);
    void loadMaterialPreview(material.path, {
      signal: abort.signal,
      expectedUserId: demo ? undefined : ownerId,
    })
      .then(async (data) => {
        if (!active) return;
        loadingTask = getDocument({
          data,
          enableXfa: false,
          useSystemFonts: true,
          stopAtErrors: true,
        });
        const document = await loadingTask.promise;
        if (active) setPdf(document);
      })
      .catch((error: unknown) => {
        if (active)
          setLoadError(
            error instanceof Error
              ? error.message
              : "Не удалось открыть презентацию.",
          );
      });
    return () => {
      active = false;
      abort.abort();
      void loadingTask?.destroy().catch(() => undefined);
    };
  }, [material.path, ownerId, demo, retry]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      // A modest inset leaves space for the page shadow on narrow screens too.
      setWidth(Math.max(160, stage.clientWidth - 32));
      setHeight(Math.max(1, stage.clientHeight - 32));
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(stage);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [expanded]);

  useEffect(() => {
    if (!stageRef.current) return;
    stageRef.current.scrollTop = 0;
    stageRef.current.scrollLeft = 0;
  }, [page, material.path]);

  useEffect(() => {
    if (!pdf) return;
    let active = true;
    let renderTask: RenderTask | undefined;
    // Different effects always receive different canvas nodes (see key below),
    // so a cancelled PDF render can never draw into a new page's canvas.
    const canvas = canvasRef.current;
    setRendering(true);
    setPageError("");
    setText("");
    void (async () => {
      const pdfPage = await pdf.getPage(page);
      if (!active || !canvas) return;
      const unscaled = pdfPage.getViewport({ scale: 1 });
      const viewport = pdfPage.getViewport({
        // At 100%, show the entire slide, including short landscape windows.
        // Larger explicit zoom values can still be explored by scrolling.
        scale:
          Math.min(width / unscaled.width, height / unscaled.height) * zoom,
      });
      // Limit raster memory at high zoom without restricting readable CSS size.
      const outputScale = Math.min(
        window.devicePixelRatio || 1,
        2,
        Math.sqrt(12_000_000 / (viewport.width * viewport.height)),
      );
      canvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
      canvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      const context = canvas.getContext("2d");
      if (!context)
        throw new Error("Браузер не поддерживает просмотр слайдов.");
      renderTask = pdfPage.render({
        canvas,
        canvasContext: context,
        viewport,
        transform:
          outputScale === 1
            ? undefined
            : [outputScale, 0, 0, outputScale, 0, 0],
      });
      // Expose the slide's actual selectable text in a separate accessible view.
      // No PDF-supplied markup or links are inserted into the document.
      void pdfPage
        .getTextContent()
        .then((content) => {
          if (!active) return;
          const transcript = content.items
            .map((item) =>
              "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
            )
            .join("")
            .trim();
          setText(transcript);
        })
        .catch(() => {
          if (active) setText("");
        });
      await renderTask.promise;
      if (active) setRendering(false);
    })().catch((error: unknown) => {
      if (!active) return;
      setRendering(false);
      setPageError(
        error instanceof Error ? error.message : "Не удалось показать слайд.",
      );
    });
    return () => {
      active = false;
      renderTask?.cancel();
    };
  }, [pdf, page, width, height, zoom]);

  useEffect(() => {
    const change = () =>
      setFullscreen(document.fullscreenElement === dialogRef.current);
    document.addEventListener("fullscreenchange", change);
    return () => document.removeEventListener("fullscreenchange", change);
  }, []);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      )
        return;
      if (event.altKey || event.ctrlKey || event.metaKey || !pdf) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setPage((current) => Math.max(1, current - 1));
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setPage((current) => Math.min(pdf.numPages, current + 1));
      }
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [pdf]);

  async function toggleFullscreen() {
    if (document.fullscreenElement === dialogRef.current) {
      await document.exitFullscreen?.().catch(() => undefined);
      return;
    }
    if (expanded) {
      setExpanded(false);
      return;
    }
    try {
      if (!dialogRef.current?.requestFullscreen) throw new Error("unsupported");
      await dialogRef.current.requestFullscreen();
    } catch {
      // iOS and embedded browsers may not expose the Fullscreen API.
      setExpanded(true);
    }
  }

  return createPortal(
    <div className="presentation-overlay">
      <div
        ref={dialogRef}
        className={`presentation-viewer${expanded ? " is-expanded" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        aria-describedby={noteId}
      >
        <header className="presentation-header">
          <div>
            <span className="presentation-eyebrow">{t("МАТЕРИАЛ УРОКА")}</span>
            <h2 id={labelId}>{t(title)}</h2>
          </div>
          <button
            type="button"
            className="presentation-icon-button"
            onClick={onClose}
            aria-label={t("Закрыть презентацию")}
            title={t("Закрыть (Escape)")}
          >
            <X size={20} />
          </button>
        </header>
        <div
          className="presentation-toolbar"
          aria-label={t("Управление презентацией")}
        >
          <div className="presentation-control-group">
            <button
              type="button"
              className="presentation-icon-button"
              onClick={() => setPage(page - 1)}
              disabled={!pdf || page <= 1}
              aria-label={t("Предыдущий слайд")}
            >
              <ChevronLeft size={19} />
            </button>
            <output
              className="presentation-page-count"
              aria-live="polite"
              aria-atomic="true"
            >
              {t(pdf ? `Слайд ${page} из ${pdf.numPages}` : "Слайды")}
            </output>
            <button
              type="button"
              className="presentation-icon-button"
              onClick={() => setPage(page + 1)}
              disabled={!pdf || page >= pdf.numPages}
              aria-label={t("Следующий слайд")}
            >
              <ChevronRight size={19} />
            </button>
          </div>
          <div className="presentation-control-group presentation-zoom-controls">
            <button
              type="button"
              className="presentation-icon-button"
              aria-label={t("Уменьшить масштаб")}
              disabled={!pdf || zoom <= 0.5}
              onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))}
            >
              <ZoomOut size={18} />
            </button>
            <span className="presentation-zoom-label">
              {t(Math.round(zoom * 100))}%
            </span>
            <button
              type="button"
              className="presentation-icon-button"
              aria-label={t("Увеличить масштаб")}
              disabled={!pdf || zoom >= 2}
              onClick={() => setZoom((value) => Math.min(2, value + 0.25))}
            >
              <ZoomIn size={18} />
            </button>
            <button
              type="button"
              className="presentation-icon-button"
              aria-label={t("Вписать слайд")}
              title={t("Вписать слайд")}
              disabled={!pdf || zoom === 1}
              onClick={() => setZoom(1)}
            >
              <Expand size={18} />
            </button>
          </div>
          <button
            type="button"
            className="presentation-icon-button presentation-fullscreen"
            onClick={() => void toggleFullscreen()}
            aria-label={t(
              fullscreen || expanded
                ? "Выйти из полноэкранного режима"
                : "На весь экран",
            )}
          >
            {t(
              fullscreen || expanded ? (
                <Minimize size={18} />
              ) : (
                <Maximize size={18} />
              ),
            )}
          </button>
        </div>
        <div
          ref={stageRef}
          className="presentation-stage"
          aria-busy={(!pdf && !loadError) || rendering}
        >
          {t(
            loadError ? (
              <div className="presentation-state" role="alert">
                <h3>{t("Презентация недоступна")}</h3>
                <p>{t(loadError)}</p>
                <button
                  type="button"
                  onClick={() => setRetry((value) => value + 1)}
                >
                  <RotateCcw size={16} />
                  {t(" Повторить")}
                </button>
              </div>
            ) : !pdf ? (
              <div className="presentation-state" role="status">
                <LoaderCircle size={24} className="presentation-loader" />
                <p>{t("Загрузка презентации…")}</p>
              </div>
            ) : (
              <div className="presentation-slide-wrap">
                {t(
                  rendering && (
                    <div className="presentation-render-status" role="status">
                      {t("Загрузка слайда…")}
                    </div>
                  ),
                )}
                {t(
                  pageError && (
                    <div className="presentation-state" role="alert">
                      <p>{t(pageError)}</p>
                      <button
                        type="button"
                        onClick={() => setRetry((value) => value + 1)}
                      >
                        {t("Повторить")}
                      </button>
                    </div>
                  ),
                )}
                <canvas
                  key={`${page}:${width}:${height}:${zoom}:${retry}`}
                  ref={canvasRef}
                  role="img"
                  aria-label={t(`Слайд ${page}. Текст слайда доступен ниже.`)}
                  style={{
                    visibility: rendering || pageError ? "hidden" : "visible",
                  }}
                />
              </div>
            ),
          )}
        </div>
        {t(
          pdf && !pageError && (
            <details className="presentation-transcript">
              <summary>
                {t("Текст слайда ")}
                {t(page)}
              </summary>
              <div tabIndex={0}>
                {text ||
                  t(
                    rendering
                      ? "Загрузка текста…"
                      : "На этом слайде нет доступного текстового слоя.",
                  )}
              </div>
            </details>
          ),
        )}
        <footer className="presentation-footer">
          <p id={noteId}>
            {t("Статичные слайды. Анимации PowerPoint не воспроизводятся.")}
          </p>
          <button type="button" onClick={onDownload}>
            <ArrowDownToLine size={16} />
            <span>{t("Скачать оригинал")}</span>
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
