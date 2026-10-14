import { useEffect, useRef, useState } from "react";
import { FileText, Upload, X } from "lucide-react";
import { api, downloadMaterial, uploadClassMaterial } from "../lib/api";
import { t } from "../lib/i18n";
import { useDialog } from "../lib/useDialog";
import type { CustomSection, Material } from "../lib/types";
import type { ClassMaterial } from "../../shared/materials";

export function ClassMaterials({ classId, ownerId, teacher, sections, onPreview, onNotice }: {
  classId: string; ownerId: string; teacher: boolean; sections: CustomSection[];
  onPreview: (material: Material) => void; onNotice: (message: string) => void;
}) {
  const [materials, setMaterials] = useState<ClassMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<File>();
  const [uploadError, setUploadError] = useState("");
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useDialog(open, () => { if (!busy) setOpen(false); });
  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setMaterials([]);
    api<{ materials: ClassMaterial[] }>(`/class-materials?classId=${encodeURIComponent(classId)}`)
      .then(data => { if (active) setMaterials(data.materials || []); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Не удалось загрузить материалы."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [classId, ownerId, revision]);
  const powerpoint = file?.name.toLowerCase().endsWith(".pptx");
  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || busy || !teacher) return;
    const data = new FormData(event.currentTarget);
    setBusy(true); setUploadError("");
    try {
      await uploadClassMaterial({ classId, sectionId: String(data.get("sectionId") || "") || null,
        title: String(data.get("title") || ""), file, preview: powerpoint ? preview : undefined,
        expectedUserId: ownerId });
      if (!mounted.current) return;
      setOpen(false); setFile(undefined); setPreview(undefined); setRevision(value => value + 1);
      onNotice("Материал загружен и доступен ученикам класса.");
    } catch (reason) {
      if (mounted.current) setUploadError(reason instanceof Error ? reason.message : "Не удалось загрузить файл.");
    } finally { if (mounted.current) setBusy(false); }
  }
  return <section className="class-materials">
    <div className="section-heading">
      <h2>{t("Материалы класса")}</h2>
      {teacher && <button className="secondary-button" onClick={() => {
        setFile(undefined); setPreview(undefined); setUploadError(""); setOpen(true);
      }}><Upload size={16} />{t("Загрузить материал")}</button>}
    </div>
    {loading ? <p role="status">{t("Загрузка материалов…")}</p> : error ?
      <div className="empty-state" role="alert"><p>{t(error)}</p>
        <button className="text-button" onClick={() => setRevision(value => value + 1)}>{t("Повторить")}</button></div>
      : materials.length ? <div className="class-material-list">{materials.map(material =>
        <article className="class-material-card" key={material.id}>
          <FileText size={22} />
          <div><h3>{material.title}</h3><p>{material.filename}</p>
            {material.section_id && <p>{sections.find(section => section.id === material.section_id)?.title}</p>}</div>
          <div className="button-row">
            {material.type === "presentation" && <button className="text-button" onClick={() => onPreview(material)}>{t("Просмотреть")}</button>}
            <button className="text-button" onClick={() => void downloadMaterial(material.path)
              .catch(reason => onNotice(reason instanceof Error ? reason.message : "Не удалось скачать материал."))}>{t("Скачать файл")}</button>
          </div>
        </article>)}</div>
      : <div className="empty-state">{t("Учитель пока не загрузил файлы.")}</div>}
    {open && <div className="modal-overlay" onClick={() => { if (!busy) setOpen(false); }}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="upload-material-title" onClick={event => event.stopPropagation()}>
        <button className="icon-button modal-close" disabled={busy} aria-label={t("Закрыть")} onClick={() => setOpen(false)}><X size={20} /></button>
        <h2 id="upload-material-title">{t("Загрузить материал")}</h2>
        <p>{t("PDF открывается на сайте. Для PowerPoint приложите PDF-копию. DOCX доступен для скачивания.")}</p>
        <form className="stack-form" onSubmit={upload}>
          {uploadError && <p className="classroom-form-error" role="alert">{t(uploadError)}</p>}
          <label>{t("Название")}<input name="title" required maxLength={150} disabled={busy} /></label>
          <label>{t("Урок")}<select name="sectionId" disabled={busy}>
            <option value="">{t("Общий материал класса")}</option>
            {sections.map(section => <option key={section.id} value={section.id}>{section.title}</option>)}
          </select></label>
          <label>{t("Файл PDF, PPTX или DOCX")}
            <input type="file" name="file" required accept=".pdf,.pptx,.docx" disabled={busy}
              onChange={event => { setFile(event.target.files?.[0]); setPreview(undefined); }} /></label>
          {powerpoint && <label>{t("PDF-копия для просмотра")}
            <input type="file" name="preview" required accept=".pdf" disabled={busy}
              onChange={event => setPreview(event.target.files?.[0])} /></label>}
          <p className="classroom-code-hint">{t("До 20 МБ на файл. Доступ — только участникам класса.")}</p>
          <button className="primary-button" disabled={busy || !file || (powerpoint && !preview)}>
            {t(busy ? "Загрузка и проверка…" : "Загрузить и опубликовать")}</button>
        </form>
      </section>
    </div>}
  </section>;
}
