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
  const [lang, setLang] = useState<Lang>("en");

  const toggle = () => setLang((l) => l === "en" ? "ml" : "en");

  return (
    <LanguageContext.Provider value={{ lang, t: T[lang], toggle }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
