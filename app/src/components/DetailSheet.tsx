import { t } from "../i18n";
import { useEffect, useRef, type ReactNode } from "react";

export function DetailSheet({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    if (typeof element.showModal === "function") element.showModal();
    else element.setAttribute("open", "");
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { if (typeof element.close === "function") element.close(); else element.removeAttribute("open"); document.body.style.overflow = previousOverflow; };
  }, []);
  return <dialog ref={dialog} className="detail-sheet" aria-labelledby="sheet-title" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="sheet-panel">
      <div className="sheet-heading"><h2 id="sheet-title">{title}</h2><button type="button" onClick={onClose} aria-label={t("Закрыть окно")}>×</button></div>
      {children}
    </div>
  </dialog>;
}
