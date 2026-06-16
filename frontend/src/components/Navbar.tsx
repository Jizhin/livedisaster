import { ChevronDown, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext";

export function Navbar() {
  const { lang, t, toggle } = useLanguage();

  return (
    <header className="ct-header">
      <div className="ct-header-inner">
        <Link to="/" className="ct-brand">
          <div className="ct-brand-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M5 12.55a11 11 0 0 1 14.08 0" stroke="white" strokeWidth="2.3" strokeLinecap="round"/>
              <path d="M1.42 9a16 16 0 0 1 21.16 0" stroke="white" strokeWidth="2.3" strokeLinecap="round"/>
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0" stroke="white" strokeWidth="2.3" strokeLinecap="round"/>
              <circle cx="12" cy="20" r="1.5" fill="white"/>
            </svg>
          </div>
          <div className="ct-brand-text">
            <span className="ct-brand-name">Citizen Alert</span>
            <span className="ct-brand-tagline">{t.brandTagline}</span>
          </div>
        </Link>

        <div className="ct-nav-right">
          <div className="ct-region-chip">
            <MapPin size={13} />
            <span>{t.regionLabel}</span>
            <ChevronDown size={12} />
          </div>

          <button className="ct-lang-toggle" onClick={toggle} aria-label="Toggle language">
            <span className={lang === "en" ? "ct-lang-active" : ""}>EN</span>
            <span className="ct-lang-sep">|</span>
            <span className={lang === "ml" ? "ct-lang-active" : ""}>മല</span>
          </button>
        </div>
      </div>
    </header>
  );
}
