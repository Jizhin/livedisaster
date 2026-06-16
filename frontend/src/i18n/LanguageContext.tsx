import { createContext, useContext, useState } from "react";
import type { Lang } from "./translations";
import { T } from "./translations";

interface LangCtx {
  lang:   Lang;
  t:      typeof T["en"];
  toggle: () => void;
}

const LanguageContext = createContext<LangCtx>({
  lang:   "en",
  t:      T.en,
  toggle: () => {},
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    try { return (localStorage.getItem("kl_lang") as Lang) || "en"; }
    catch { return "en"; }
  });

  const toggle = () => {
    const next: Lang = lang === "en" ? "ml" : "en";
    setLang(next);
    try { localStorage.setItem("kl_lang", next); } catch { /* ignored */ }
  };

  return (
    <LanguageContext.Provider value={{ lang, t: T[lang], toggle }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
