import { Bookmark, ExternalLink, Globe, Newspaper } from "lucide-react";
import { useState } from "react";
import type { DistrictNewsResponse, ManoramaArticle } from "../types";

const ML_LABELS: Record<string, string> = {
  liveNews: "തൽസമയ വാർത്ത",
  source: "മനോരമ ഓൺലൈൻ",
  readMore: "കൂടുതൽ വായിക്കുക",
  noNews: "ഇപ്പോൾ വാർത്തകൾ ലഭ്യമല്ല",
  loading: "വാർത്തകൾ ലോഡ് ചെയ്യുന്നു…",
  allAreas: "എല്ലാം",
  viewSource: "മനോരമ ഓൺലൈനിൽ കാണുക",
};

const EN_LABELS: Record<string, string> = {
  liveNews: "Live News",
  source: "Manorama Online",
  readMore: "Read more",
  noNews: "No news available right now",
  loading: "Loading news…",
  allAreas: "All Areas",
  viewSource: "View on Manorama Online",
};

function timeLabel(raw: string, lang: "ml" | "en"): string {
  if (!raw) return "";
  // If it's already human-readable (e.g. "4 HOURS AGO"), return as-is
  if (/ago|hour|min|day|yesterday/i.test(raw)) return raw;
  // Try to parse ISO date
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    if (lang === "ml") {
      return d.toLocaleDateString("ml-IN", { day: "numeric", month: "long", year: "numeric" });
    }
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return raw;
  }
}

function ArticleCard({
  article,
  size,
  lang,
}: {
  article: ManoramaArticle;
  size: "featured" | "grid" | "sidebar";
  lang: "ml" | "en";
}) {
  const L = lang === "ml" ? ML_LABELS : EN_LABELS;
  const fontClass = lang === "ml" ? "ml-font" : "";
  const [bookmarked, setBookmarked] = useState(false);

  return (
    <article className={`mn-card mn-card--${size}`}>
      {article.image_url && (
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mn-card__img-wrap"
        >
          <img
            src={article.image_url}
            alt={article.title}
            className="mn-card__img"
            loading="lazy"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        </a>
      )}
      <div className="mn-card__body">
        {article.sub_district && (
          <span className="mn-tag">{article.sub_district}</span>
        )}
        <time className="mn-time">{timeLabel(article.published_at, lang)}</time>
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`mn-card__title ${fontClass}`}
        >
          {article.title}
        </a>
        {size !== "sidebar" && article.summary && (
          <p className={`mn-card__summary ${fontClass}`}>{article.summary}</p>
        )}
        <div className="mn-card__foot">
          {size !== "sidebar" && (
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mn-read-more"
            >
              {L.readMore} →
            </a>
          )}
          <button
            className={`mn-bookmark${bookmarked ? " mn-bookmark--active" : ""}`}
            onClick={() => setBookmarked((v) => !v)}
            title="Bookmark"
          >
            <Bookmark size={15} fill={bookmarked ? "currentColor" : "none"} />
          </button>
        </div>
      </div>
    </article>
  );
}

function SidebarArticle({
  article,
  lang,
}: {
  article: ManoramaArticle;
  lang: "ml" | "en";
}) {
  const fontClass = lang === "ml" ? "ml-font" : "";
  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mn-side-row"
    >
      {article.image_url && (
        <img
          src={article.image_url}
          alt=""
          className="mn-side-thumb"
          loading="lazy"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      )}
      <div className="mn-side-body">
        <time className="mn-time">{timeLabel(article.published_at, lang)}</time>
        <p className={`mn-side-title ${fontClass}`}>{article.title}</p>
        {article.sub_district && (
          <span className="mn-tag mn-tag--small">{article.sub_district}</span>
        )}
      </div>
    </a>
  );
}

export function ManoramaNewsSection({
  data,
  loading,
  lang,
  onLangToggle,
  districtName,
}: {
  data: DistrictNewsResponse | null;
  loading: boolean;
  lang: "ml" | "en";
  onLangToggle: () => void;
  districtName: string;
}) {
  const L = lang === "ml" ? ML_LABELS : EN_LABELS;
  const [activeArea, setActiveArea] = useState<string>("all");

  const articles = data?.articles ?? [];
  const subAreas = data?.sub_areas ?? [];

  const filtered =
    activeArea === "all"
      ? articles
      : articles.filter(
          (a) =>
            a.sub_district?.toLowerCase() === activeArea.toLowerCase()
        );

  const featured = filtered[0] ?? null;
  const gridItems = filtered.slice(1, 5);
  const sidebarItems = filtered.slice(5, 12);

  return (
    <section className="mn-section">
      {/* ─── Header ─────────────────────────────────── */}
      <div className="mn-header">
        <div className="mn-header__left">
          <Newspaper size={18} style={{ color: "#dc2626" }} />
          <span className={`mn-header__title${lang === "ml" ? " ml-font" : ""}`}>
            {L.liveNews} — {districtName}
          </span>
          <span className="mn-source-badge">
            <Globe size={11} />
            {L.source}
          </span>
        </div>
        <div className="mn-header__right">
          <button className="mn-lang-toggle" onClick={onLangToggle}>
            <span className={lang === "ml" ? "mn-lang--active" : ""}>മ</span>
            <span className="mn-lang-sep">|</span>
            <span className={lang === "en" ? "mn-lang--active" : ""}>EN</span>
          </button>
          {data?.source_url && (
            <a
              href={data.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mn-external-link"
            >
              <ExternalLink size={13} />
              {L.viewSource}
            </a>
          )}
        </div>
      </div>

      {/* ─── Sub-area Tabs ───────────────────────────── */}
      {subAreas.length > 0 && (
        <div className="mn-tabs">
          <button
            className={`mn-tab${activeArea === "all" ? " mn-tab--active" : ""}`}
            onClick={() => setActiveArea("all")}
          >
            {L.allAreas}
          </button>
          {subAreas.map((area) => (
            <button
              key={area}
              className={`mn-tab${activeArea === area ? " mn-tab--active" : ""}`}
              onClick={() => setActiveArea(area)}
            >
              {area.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {/* ─── Content ─────────────────────────────────── */}
      {loading ? (
        <div className="mn-loading">
          <div className="mn-skeleton mn-skeleton--featured" />
          <div className="mn-grid-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="mn-skeleton mn-skeleton--grid" />
            ))}
          </div>
        </div>
      ) : articles.length === 0 ? (
        <div className="mn-empty">
          <Newspaper size={36} />
          <p className={lang === "ml" ? "ml-font" : ""}>{L.noNews}</p>
          {data?.source_url && (
            <a href={data.source_url} target="_blank" rel="noopener noreferrer">
              {L.viewSource} <ExternalLink size={13} />
            </a>
          )}
        </div>
      ) : (
        <div className="mn-body">
          {/* Main column */}
          <div className="mn-main">
            {featured && (
              <ArticleCard article={featured} size="featured" lang={lang} />
            )}
            {gridItems.length > 0 && (
              <div className="mn-grid-2">
                {gridItems.map((a, i) => (
                  <ArticleCard key={i} article={a} size="grid" lang={lang} />
                ))}
              </div>
            )}
          </div>

          {/* Sidebar */}
          {sidebarItems.length > 0 && (
            <aside className="mn-sidebar">
              {sidebarItems.map((a, i) => (
                <SidebarArticle key={i} article={a} lang={lang} />
              ))}
            </aside>
          )}
        </div>
      )}
    </section>
  );
}
