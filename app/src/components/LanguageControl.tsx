import { DetailSheet } from "./DetailSheet";
import { languages, languageNames, setLanguage, useI18n, type Language } from "../i18n";

export function LanguageControl({ open, onOpen, onClose, onChange }: { open: boolean; onOpen: () => void; onClose: () => void; onChange: (language: Language) => void }) {
  const { language, t } = useI18n();
  return <>
    <div className="language-control">
      <button className="language-trigger" type="button" aria-label={t("Выбрать язык")} aria-haspopup="dialog" aria-expanded={open} onClick={onOpen} data-figma-node="2013:6443"><span dir="ltr">{language.toUpperCase()}</span></button>
    </div>
    {open && <DetailSheet title={t("Язык")} onClose={onClose}>
      <div className="language-options" role="group" aria-label={t("Выбрать язык")}>
        {languages.map(code => <button className="language-option" key={code} type="button" aria-pressed={code === language} onClick={() => { if (code !== language) { onChange(code); setLanguage(code); } onClose(); }}>
          <span lang={code} dir={code === "ar" ? "rtl" : "ltr"}>{languageNames[code]}</span><span className="language-code" dir="ltr" aria-hidden="true">{code === language ? "●" : code.toUpperCase()}</span>
        </button>)}
      </div>
      <p className="language-note">{t("Язык интерфейса и аудио")}</p>
    </DetailSheet>}
  </>;
}
