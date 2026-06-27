import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "../i18n/LanguageContext";

/* ─── Types ─────────────────────────────────────────────────── */

type Severity = "safe" | "warn" | "critical";

type District = {
  code: string;
  name: string;
  slug: string;
  lat: number;
  lon: number;
};

type Report = {
  id: string;
  district: string;
  place: string | null;
  lat: number | null;
  lon: number | null;
  created_at: string;
  message: string;
  severity: Severity;
  category: string | null;
  image_url: string | null;
};

type OfficialAlert = {
  id: string;
  source: string;
  disasterType: string;
  severity: Severity;
  severityLabel: string;
  areaDescription: string;
  message: string;
  effectiveStart: string | null;
  effectiveEnd: string | null;
  district: string | null;
};

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
    district?: string;
  };
};

type Place = {
  name: string;
  context: string;
  lat: number;
  lon: number;
  country: string;
  city: string | null;
};

type ApiReport = {
  id: number;
  district_name: string | null;
  district_slug: string | null;
  locality: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  content: string;
  severity: string;
  category: string | null;
  country: string | null;
  images: Array<{ file_path: string }>;
};

type ApiComment = { id: number; author_name: string; content: string; created_at: string };
type ApiReportDetail = ApiReport & {
  confirmed_count?: number;
  incorrect_count?: number;
  resolved_count?: number;
  comment_count?: number;
  views_count?: number;
  status?: string;
  comments?: ApiComment[];
};

/* ─── Constants ─────────────────────────────────────────────── */

const CATEGORY_META: Record<string, { emoji: string; labelKey: string }> = {
  "Flood":             { emoji: "🌊", labelKey: "catFlood" },
  "Landslide":         { emoji: "⛰️", labelKey: "catLandslide" },
  "Road Damage":       { emoji: "🚧", labelKey: "catRoad" },
  "Power Outage":      { emoji: "⚡", labelKey: "catPower" },
  "Medical Emergency": { emoji: "🚨", labelKey: "catMedical" },
  "Fire":              { emoji: "🔥", labelKey: "catFire" },
  "Other":             { emoji: "📌", labelKey: "catOther" },
};

const SEVERITY_RANK: Record<Severity, number> = { safe: 0, warn: 1, critical: 2 };
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000/api";
const UPLOADS_ORIGIN = API_BASE.replace(/\/api$/, "");

/* ─── Helpers ───────────────────────────────────────────────── */

function maxSeverity(items: Array<{ severity: Severity }>): Severity {
  let best: Severity = "safe";
  for (const it of items) {
    if (SEVERITY_RANK[it.severity] > SEVERITY_RANK[best]) best = it.severity;
  }
  return best;
}

function toPlace(f: PhotonFeature): Place {
  const p = f.properties;
  const [lon, lat] = f.geometry.coordinates;
  const country = p.country ?? "Unknown";
  const city = p.city ?? p.county ?? null;
  const ctxParts = [p.city, p.county, p.state, p.country].filter(Boolean) as string[];
  const context = Array.from(new Set(ctxParts)).join(" · ");
  return { name: p.name ?? city ?? "Unknown location", context: context || country, lat, lon, country, city };
}

function mapApiReport(r: ApiReport): Report {
  const firstImage = r.images?.[0]?.file_path ?? null;
  return {
    id: String(r.id),
    district: r.district_name ?? r.country ?? "",
    place: r.locality ?? null,
    lat: r.latitude ?? null,
    lon: r.longitude ?? null,
    created_at: r.created_at,
    message: r.content,
    severity: (r.severity as Severity) ?? "warn",
    category: r.category ?? null,
    image_url: firstImage ? `${UPLOADS_ORIGIN}/uploads/${firstImage}` : null,
  };
}

function formatReportTime(iso: string) {
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

function catMeta(c: string | null) {
  return CATEGORY_META[c ?? ""] ?? { emoji: "📌", labelKey: "catOther" };
}

function reportInitials(id: string): string {
  const n = parseInt(id, 10) || 0;
  const letters = "ABCDEFGHJKLMNPQRSTUVWXY";
  return letters[n % letters.length] + letters[(n * 7) % letters.length];
}

const sevText = (s: Severity) =>
  s === "critical" ? "text-destructive" : s === "warn" ? "text-warn" : "text-success";

const sevBadge = (s: Severity) =>
  s === "critical"
    ? "bg-destructive/10 text-destructive border-destructive/25"
    : s === "warn"
    ? "bg-warn/15 text-warn border-warn/25"
    : "bg-success/10 text-success border-success/25";

const sevBorderL = (s: Severity) =>
  s === "critical" ? "border-l-destructive" : s === "warn" ? "border-l-warn" : "border-l-success";

/* ─── Hooks ─────────────────────────────────────────────────── */

function usePhotonSearch(query: string) {
  const [results, setResults] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    const ctrl = new AbortController();
    const tid = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8`,
          { signal: ctrl.signal }
        );
        const data: { features: PhotonFeature[] } = await res.json();
        setResults((data.features ?? []).map(toPlace));
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => { clearTimeout(tid); ctrl.abort(); };
  }, [query]);

  return { results, loading };
}

async function reverseGeocode(lat: number, lon: number): Promise<Place | null> {
  try {
    const res = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}&limit=1`);
    const data: { features: PhotonFeature[] } = await res.json();
    const f = data.features?.[0];
    if (!f) return null;
    return toPlace(f);
  } catch { return null; }
}

function useReportDetail(reportId: string | null) {
  const [data, setData] = useState<ApiReportDetail | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!reportId) { setData(null); return; }
    setLoading(true);
    fetch(`${API_BASE}/reports/${reportId}`)
      .then((r) => r.json())
      .then((d: ApiReportDetail) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [reportId]);
  return { data, loading };
}

function useLiveReports(limit = 50) {
  const [reports, setReports] = useState<Report[]>([]);
  const [status, setStatus] = useState<"connecting" | "live" | "offline">("connecting");
  const [flashId, setFlashId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const prevIdsRef = useRef<Set<string>>(new Set());

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let active = true;
    async function fetchReports() {
      try {
        const res = await fetch(`${API_BASE}/reports/feed?limit=${limit}`);
        if (!res.ok) throw new Error(`${res.status}`);
        const raw: ApiReport[] = await res.json();
        if (!active) return;
        const mapped = raw.map(mapApiReport);
        const newOnes = mapped.filter((r) => !prevIdsRef.current.has(r.id));
        if (newOnes.length > 0 && prevIdsRef.current.size > 0) {
          setFlashId(newOnes[0].id);
          setTimeout(() => setFlashId((id) => (id === newOnes[0].id ? null : id)), 4000);
        }
        prevIdsRef.current = new Set(mapped.map((r) => r.id));
        setReports(mapped);
        setStatus("live");
      } catch {
        if (active) setStatus("offline");
      }
    }
    fetchReports();
    const interval = setInterval(fetchReports, 20000);
    return () => { active = false; clearInterval(interval); };
  }, [limit, refreshKey]);

  return { reports, status, flashId, refresh };
}

function useKeralaAlerts() {
  const [alerts, setAlerts] = useState<OfficialAlert[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    let active = true;
    const load = () => {
      fetch(`${API_BASE}/ndma-alerts`)
        .then((r) => r.json())
        .then((data: OfficialAlert[]) => { if (!active) return; setAlerts(data); setStatus("ready"); })
        .catch((err) => { console.error("[alerts]", err); if (active) setStatus("error"); });
    };
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => { active = false; clearInterval(id); };
  }, []);
  return { alerts, status };
}

/* ─── Module-level welcome flag ──────────────────────────────── */
const WELCOME_KEY = "lk_welcome_done";

/* ─── Loading Screen ────────────────────────────────────────── */
const LOADING_MSG_KEYS = [
  { h: "loadMsg1h", s: "loadMsg1s" },
  { h: "loadMsg2h", s: "loadMsg2s" },
  { h: "loadMsg3h", s: "loadMsg3s" },
  { h: "loadMsg4h", s: "loadMsg4s" },
  { h: "loadMsg5h", s: "loadMsg5s" },
  { h: "loadMsg6h", s: "loadMsg6s" },
] as const;

function LoadingScreen({ fading }: { fading: boolean }) {
  const { t } = useLanguage();
  const [msgIdx, setMsgIdx] = useState(0);
  const [textVisible, setTextVisible] = useState(true);

  useEffect(() => {
    const id = setInterval(() => {
      setTextVisible(false);
      setTimeout(() => {
        setMsgIdx((i) => (i + 1) % LOADING_MSG_KEYS.length);
        setTextVisible(true);
      }, 350);
    }, 2400);
    return () => clearInterval(id);
  }, []);

  const keys = LOADING_MSG_KEYS[msgIdx];
  const msg = { headline: t[keys.h], sub: t[keys.s] };

  return (
    <div
      className={`fixed inset-0 z-[9000] flex flex-col items-center justify-center bg-primary px-8 transition-opacity duration-700 ${
        fading ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[var(--color-gold)]/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-accent/20 blur-3xl" />

      <div className="relative flex w-full max-w-xs flex-col items-center text-center">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-[var(--color-gold)] font-display text-xl font-bold text-primary shadow-xl ring-4 ring-[var(--color-gold)]/30 mb-5">
          DW
        </div>
        <div className="font-display text-2xl font-bold text-primary-foreground">
          Disaster<span className="text-[var(--color-gold)]">Watch</span>
        </div>
        <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-foreground/50">
          Community · Live · Global
        </p>
        <div className="mt-8 flex items-center gap-2 mb-10">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="rounded-full bg-[var(--color-gold)]"
              style={{ width: i === 2 ? "0.625rem" : "0.375rem", height: i === 2 ? "0.625rem" : "0.375rem",
                opacity: i === 2 ? 1 : 0.4, animation: `live-pulse 1.6s ease-out ${i * 0.15}s infinite` }} />
          ))}
        </div>
        <div className="min-h-[5rem] transition-opacity duration-300" style={{ opacity: textVisible ? 1 : 0 }}>
          <p className="font-display text-[18px] font-bold leading-snug text-primary-foreground">{msg.headline}</p>
          <p className="mt-2.5 text-sm leading-relaxed text-primary-foreground/65">{msg.sub}</p>
        </div>
        <div className="mt-8 h-1 w-48 overflow-hidden rounded-full bg-primary-foreground/10">
          <div className="h-full rounded-full bg-[var(--color-gold)]"
            style={{ animation: "loading-bar 2.4s ease-in-out infinite" }} />
        </div>
      </div>
      <div className="absolute bottom-10 flex items-center gap-2 rounded-full border border-primary-foreground/10 bg-primary-foreground/5 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-primary-foreground/50">
        <span className="live-dot" />
        {t.welcomeLoading}
      </div>
      <style>{`
        @keyframes loading-bar {
          0%   { width: 0%;   margin-left: 0%; }
          50%  { width: 60%;  margin-left: 20%; }
          100% { width: 0%;   margin-left: 100%; }
        }
      `}</style>
    </div>
  );
}

/* ─── Site Header ────────────────────────────────────────────── */
function StatChip({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${cls}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
      <span className="text-sm font-bold tabular-nums">{value}</span>
      <span className="text-[11px] font-medium opacity-80">{label}</span>
    </div>
  );
}

function SiteHeader({
  reportsCount, status, stats, onReport, onRefresh, lang, toggle,
}: {
  reportsCount: number;
  status: "connecting" | "live" | "offline";
  stats: { active: number; critical: number; today: number };
  onReport: () => void;
  onRefresh: () => void;
  lang: string;
  toggle: () => void;
}) {
  const { t } = useLanguage();
  return (
    <header className="relative z-30 shrink-0">
      <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-accent/8 to-primary/15" />
      <div className="absolute inset-0 bg-card/65 backdrop-blur-2xl" />
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
      <div className="relative px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="relative grid place-items-center h-10 w-10 rounded-2xl bg-primary font-display text-xs font-bold text-primary-foreground shadow-lg shrink-0">
            DW
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-[var(--color-gold)] ring-2 ring-card animate-pulse" />
          </div>
          <div className="leading-tight">
            <div className="font-display font-extrabold text-base sm:text-lg tracking-tight text-primary">
              Disaster<span className="text-[var(--color-gold)]">Watch</span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="live-dot" />
              <span className="text-success font-semibold">LIVE</span>
              <span>·</span>
              <span>
                {status === "live"
                  ? `${reportsCount} reports worldwide`
                  : status === "connecting"
                  ? t.statusConnecting
                  : t.statusOffline}
              </span>
            </div>
          </div>
        </div>

        {/* Stats (md+) */}
        <div className="hidden md:flex items-center gap-1.5">
          <StatChip label="Active" value={stats.active} cls="bg-warn/10 text-warn" />
          <StatChip label="Critical" value={stats.critical} cls="bg-destructive/10 text-destructive" />
          <StatChip label="Today" value={stats.today} cls="bg-accent/10 text-accent" />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button onClick={onRefresh} title="Refresh"
            className="p-2 rounded-xl text-muted-foreground hover:bg-secondary hover:text-primary transition">
            ↻
          </button>
          <button onClick={toggle}
            className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-primary/60 hover:bg-secondary transition">
            {lang === "en" ? "മ" : "EN"}
          </button>
          <button onClick={onReport}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-gold)] text-primary px-3 sm:px-4 py-2 text-sm font-bold shadow transition hover:brightness-105 active:scale-95">
            <span>＋</span>
            <span className="hidden sm:inline">{t.reportBtn}</span>
            <span className="sm:hidden">Report</span>
          </button>
        </div>
      </div>
    </header>
  );
}

/* ─── Floating Search ────────────────────────────────────────── */
function FloatingSearch({
  onPick, onLocate, locating, onClear,
}: {
  onPick: (place: Place) => void;
  onLocate: () => void;
  locating: boolean;
  onClear?: () => void;
}) {
  const [q, setQ] = useState("");
  const { results, loading } = usePhotonSearch(q);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function clearSearch() {
    setQ("");
    setOpen(false);
    onClear?.();
  }

  return (
    <div ref={boxRef} className="relative w-full">
      <div className="flex items-center gap-2 rounded-2xl bg-card/90 backdrop-blur-md shadow-xl border border-border/60 pl-4 pr-2 py-2">
        <span className="text-muted-foreground shrink-0 text-sm">⌕</span>
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); if (!e.target.value) onClear?.(); }}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search a city, street or place worldwide"
          className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground py-1 text-primary min-w-0"
        />
        {loading && <span className="text-[11px] text-muted-foreground animate-pulse shrink-0">···</span>}
        {q && !loading && (
          <button onClick={clearSearch}
            className="shrink-0 h-5 w-5 rounded-full bg-muted text-muted-foreground hover:bg-secondary hover:text-primary text-xs flex items-center justify-center transition">
            ✕
          </button>
        )}
        <button
          onClick={onLocate}
          disabled={locating}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-primary/10 text-primary px-3 py-1.5 text-xs font-medium hover:bg-primary hover:text-primary-foreground transition disabled:opacity-60"
        >
          {locating
            ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
            : "📍"}
          <span className="hidden sm:inline">{locating ? "Locating…" : "My location"}</span>
        </button>
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-[2000] left-0 right-0 mt-2 rounded-2xl border border-border bg-card shadow-xl overflow-hidden">
          {results.map((p, i) => (
            <button
              key={`${p.lat}-${p.lon}-${i}`}
              onClick={() => { onPick(p); setOpen(false); setQ(p.name); }}
              className="w-full text-left px-4 py-2.5 hover:bg-secondary flex items-start gap-3 border-b border-border/60 last:border-b-0 transition"
            >
              <span className="text-primary mt-0.5 shrink-0">📍</span>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-primary truncate">{p.name}</div>
                <div className="text-xs text-muted-foreground truncate">{p.context}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Incident Card (community-alert style) ─────────────────── */
function IncidentCard({
  report, flash, selected, onSelect,
}: {
  report: Report;
  flash: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useLanguage();
  const cat = catMeta(report.category);
  const sevCls =
    report.severity === "critical"
      ? "bg-destructive/15 text-destructive"
      : report.severity === "warn"
      ? "bg-warn/15 text-warn"
      : "bg-success/15 text-success";
  const sevLabel =
    report.severity === "critical" ? "Critical" : report.severity === "warn" ? "Warning" : "Safe";

  return (
    <li
      onClick={onSelect}
      className={`px-5 py-4 cursor-pointer transition-colors ${
        selected
          ? "bg-primary/8 border-l-2 border-l-[var(--color-gold)]"
          : flash
          ? "bg-[var(--color-gold)]/5"
          : "hover:bg-secondary/60"
      }`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${sevCls}`}>
          {sevLabel}
        </span>
        <span className="text-[10px] text-muted-foreground">{cat.emoji} {t[cat.labelKey as keyof typeof t] as string}</span>
        <span className="ml-auto text-[11px] text-muted-foreground shrink-0">{formatReportTime(report.created_at)}</span>
      </div>
      <p className="text-sm text-primary leading-snug line-clamp-3">{report.message}</p>
      {report.image_url && (
        <img src={report.image_url} alt="" className="mt-2 w-full max-h-28 rounded-xl object-cover" />
      )}
      <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
        <span>📍</span>
        <span className="truncate">{report.place ?? report.district ?? "Unknown"}</span>
      </div>
    </li>
  );
}

/* ─── Main Page ─────────────────────────────────────────────── */
export function HomePage() {
  const { lang, t, toggle } = useLanguage();
  const { reports, status, flashId, refresh: refreshFeed } = useLiveReports(50);
  const { alerts, status: alertStatus } = useKeralaAlerts();

  const [flyTo, setFlyTo] = useState<[number, number] | null>(null);
  const [mapResetView, setMapResetView] = useState(0);
  const [locating, setLocating] = useState(false);
  const [pickedLocation, setPickedLocation] = useState<Place | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<"all" | Severity>("all");

  const [reportFlowOpen, setReportFlowOpen] = useState(false);
  const [districtFocus, setDistrictFocus] = useState<string | null>(null);
  const [detailReport, setDetailReport] = useState<Report | null>(null);
  const [mapPickPlace, setMapPickPlace] = useState<Place | null>(null);
  const [mapPickLoading, setMapPickLoading] = useState(false);
  const [mapPickReset, setMapPickReset] = useState(0);

  const [welcomeOpen, setWelcomeOpen] = useState(() => !sessionStorage.getItem(WELCOME_KEY));
  const [loadingPhase, setLoadingPhase] = useState<"hidden" | "active" | "fading">("hidden");
  const [loadingMinPassed, setLoadingMinPassed] = useState(false);

  useEffect(() => { document.title = t.pageTitle; }, [t.pageTitle]);

  useEffect(() => {
    if (loadingPhase === "active" && loadingMinPassed && status === "live") {
      setLoadingPhase("fading");
      const tid = setTimeout(() => setLoadingPhase("hidden"), 750);
      return () => clearTimeout(tid);
    }
  }, [loadingPhase, loadingMinPassed, status]);

  const stats = useMemo(() => ({
    active: reports.filter((r) => r.severity !== "safe").length,
    critical: reports.filter((r) => r.severity === "critical").length,
    today: reports.filter((r) =>
      new Date(r.created_at).toDateString() === new Date().toDateString()
    ).length,
  }), [reports]);

  const filteredReports = useMemo(() => {
    return filterSeverity === "all" ? reports : reports.filter((r) => r.severity === filterSeverity);
  }, [reports, filterSeverity]);

  function dismissWelcome() {
    sessionStorage.setItem(WELCOME_KEY, "1");
    setWelcomeOpen(false);
    setLoadingMinPassed(false);
    setLoadingPhase("active");
    setTimeout(() => setLoadingMinPassed(true), 2200);
  }

  const handleLocate = useCallback(() => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const place = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        setLocating(false);
        if (place) {
          setFlyTo([place.lat, place.lon]);
          setPickedLocation(place);
        }
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  const handlePickPlace = useCallback((place: Place) => {
    setFlyTo([place.lat, place.lon]);
    setPickedLocation(place);
  }, []);

  async function handleMapPick(lat: number, lon: number) {
    setMapPickLoading(true);
    const place = await reverseGeocode(lat, lon);
    setMapPickLoading(false);
    const finalPlace: Place = place ?? {
      name: `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
      context: "Selected location",
      lat, lon,
      country: "Unknown",
      city: null,
    };
    setMapPickPlace(finalPlace);
    setReportFlowOpen(true);
  }

  function handleSearchClear() {
    setFlyTo(null);
    setPickedLocation(null);
    setMapResetView((n) => n + 1);
  }

  function closeReportModal() {
    setReportFlowOpen(false);
    setMapPickPlace(null);
    setMapPickReset((n) => n + 1);
  }

  const FILTER_OPTS = [
    { key: "all" as const, label: "All" },
    { key: "critical" as const, label: "Critical" },
    { key: "warn" as const, label: "Warning" },
    { key: "safe" as const, label: "Safe" },
  ];

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <SiteHeader
        reportsCount={reports.length}
        status={status}
        stats={stats}
        onReport={() => setReportFlowOpen(true)}
        onRefresh={refreshFeed}
        lang={lang}
        toggle={toggle}
      />

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden relative">

        {/* ── Left sidebar (desktop) ── */}
        <aside className="hidden lg:flex flex-col w-96 xl:w-[420px] border-r border-border bg-card shrink-0">
          <div className="px-5 pt-5 pb-3 shrink-0 border-b border-border/60">
            <h2 className="font-display text-base font-semibold text-primary">Live feed</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Latest reports from the community</p>
            <div className="mt-3 flex items-center gap-1.5 flex-wrap">
              {FILTER_OPTS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setFilterSeverity(key)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    filterSeverity === key
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:text-primary"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto no-scrollbar">
            {status === "connecting" ? (
              <div className="p-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                Connecting…
              </div>
            ) : filteredReports.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No incidents reported yet.<br />Be the first to report one.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {filteredReports.map((r) => (
                  <IncidentCard
                    key={r.id}
                    report={r}
                    flash={flashId === r.id}
                    selected={detailReport?.id === r.id}
                    onSelect={() => {
                      setDetailReport(r);
                      if (r.lat !== null && r.lon !== null) setFlyTo([r.lat, r.lon]);
                    }}
                  />
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* ── Map area ── */}
        <main className="flex-1 relative">
          {/* Floating search bar */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1500] w-[min(520px,calc(100%-2rem))]">
            <FloatingSearch onPick={handlePickPlace} onLocate={handleLocate} locating={locating} onClear={handleSearchClear} />
            {pickedLocation && (
              <div className="mt-2 mx-auto w-fit text-[11px] bg-card/95 backdrop-blur border border-border rounded-full px-3 py-1 shadow-lg text-muted-foreground flex items-center gap-1.5">
                <span>📍</span>
                <span className="max-w-[200px] truncate">{pickedLocation.name}{pickedLocation.context ? `, ${pickedLocation.context.split(" · ")[0]}` : ""}</span>
                <button
                  onClick={() => { setMapPickPlace(pickedLocation); setReportFlowOpen(true); }}
                  className="ml-1 text-[var(--color-gold)] font-semibold hover:underline whitespace-nowrap"
                >
                  Report here →
                </button>
              </div>
            )}
          </div>

          {/* Geocoding spinner */}
          {mapPickLoading && (
            <div className="absolute bottom-[calc(40vh+1.5rem)] lg:bottom-10 left-1/2 -translate-x-1/2 z-[1500] flex items-center gap-2 rounded-full bg-card border border-border px-4 py-2 text-sm font-semibold shadow-lg">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              Finding location…
            </div>
          )}

          {/* Hint */}
          {!mapPickLoading && (
            <div className="hidden lg:block absolute bottom-4 left-1/2 -translate-x-1/2 z-[1500] pointer-events-none rounded-full bg-card/85 backdrop-blur border border-border px-4 py-1.5 text-xs text-muted-foreground shadow">
              Click anywhere on the map to report an incident
            </div>
          )}

          <WorldMap
            reports={filteredReports}
            onSelectReport={(r) => setDetailReport(r)}
            onMapPick={handleMapPick}
            pickReset={mapPickReset}
            flyTo={flyTo}
            resetView={mapResetView}
          />

          {/* ── Mobile bottom sheet ── */}
          <div className="lg:hidden absolute bottom-0 left-0 right-0 z-[1500] max-h-[40vh] overflow-y-auto bg-card border-t border-border rounded-t-2xl shadow-xl">
            <div className="sticky top-0 bg-card px-4 pt-3 pb-2 border-b border-border/60 flex items-center justify-between">
              <div className="font-display font-semibold text-sm text-primary">
                {filteredReports.length} incident{filteredReports.length !== 1 ? "s" : ""}
              </div>
              <div className="flex gap-1">
                {FILTER_OPTS.slice(0, 3).map(({ key, label }) => (
                  <button key={key} onClick={() => setFilterSeverity(key)}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium capitalize transition ${
                      filterSeverity === key ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <ul className="divide-y divide-border">
              {filteredReports.slice(0, 20).map((r) => (
                <IncidentCard
                  key={r.id}
                  report={r}
                  flash={flashId === r.id}
                  selected={detailReport?.id === r.id}
                  onSelect={() => setDetailReport(r)}
                />
              ))}
            </ul>
          </div>
        </main>
      </div>

      {/* ── Modals ── */}
      {welcomeOpen && (
        <WelcomeModal
          dataReady={status === "live" && alertStatus !== "loading"}
          t={t}
          onDismiss={dismissWelcome}
        />
      )}
      {reportFlowOpen && (
        <ReportFlowModal
          onClose={closeReportModal}
          onReported={refreshFeed}
          initialPlace={mapPickPlace ?? undefined}
        />
      )}
      {districtFocus && (
        <DistrictModal
          district={districtFocus}
          reports={reports.filter((r) => r.district === districtFocus)}
          alerts={alerts.filter((a) => a.district === districtFocus)}
          onClose={() => setDistrictFocus(null)}
        />
      )}
      {detailReport && (
        <StandaloneDetailModal report={detailReport} onClose={() => setDetailReport(null)} />
      )}
      {loadingPhase !== "hidden" && <LoadingScreen fading={loadingPhase === "fading"} />}
    </div>
  );
}

/* ─── World Map (Leaflet via CDN) ───────────────────────────── */
function WorldMap({
  reports,
  onSelectReport,
  onMapPick,
  pickReset,
  flyTo,
  resetView,
}: {
  reports: Report[];
  onSelectReport: (r: Report) => void;
  onMapPick?: (lat: number, lon: number) => void;
  pickReset?: number;
  flyTo?: [number, number] | null;
  resetView?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const fitDoneRef = useRef(false);
  const pendingPinRef = useRef<any>(null);
  const onMapPickRef = useRef(onMapPick);
  onMapPickRef.current = onMapPick;
  const flyToPrevRef = useRef<[number, number] | null>(null);
  const resetViewPrevRef = useRef(0);

  useEffect(() => {
    const L = (window as any).L;
    if (!containerRef.current || mapRef.current || !L) return;
    const map = L.map(containerRef.current, {
      center: [20, 0], zoom: 2, attributionControl: false, zoomControl: true, scrollWheelZoom: false,
    });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png", {
      subdomains: "abcd", maxZoom: 19, detectRetina: true,
    }).addTo(map);
    L.control.attribution({ prefix: false }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    map.on("click", (e: any) => {
      if (!onMapPickRef.current) return;
      const { lat, lng } = e.latlng;
      if (pendingPinRef.current) { pendingPinRef.current.remove(); pendingPinRef.current = null; }
      pendingPinRef.current = L.circleMarker([lat, lng], {
        radius: 11, fillColor: "#3b82f6", color: "#fff", weight: 3, fillOpacity: 0.9,
      }).bindTooltip("📍 Finding location…", { permanent: false }).addTo(map);
      onMapPickRef.current(lat, lng);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      fitDoneRef.current = false;
      pendingPinRef.current = null;
    };
  }, []);

  useEffect(() => {
    const L = (window as any).L;
    if (!L || !mapRef.current || !layerRef.current) return;
    layerRef.current.clearLayers();
    const located = reports.filter((r) => r.lat !== null && r.lon !== null);
    located.forEach((r) => {
      const color = r.severity === "critical" ? "#ef4444" : r.severity === "warn" ? "#f59e0b" : "#22c55e";
      const circle = L.circleMarker([r.lat, r.lon], {
        radius: 9, fillColor: color, color: "#ffffff", weight: 2.5, fillOpacity: 0.9,
      });
      const label = catMeta(r.category).emoji + " " + (r.place || r.district || "");
      circle.bindTooltip(
        `<strong style="font-size:12px">${label}</strong><br/><span style="font-size:11px">${r.message.slice(0, 80)}${r.message.length > 80 ? "…" : ""}</span>`,
        { direction: "top", offset: [0, -6] }
      );
      circle.on("click", () => onSelectReport(r));
      layerRef.current.addLayer(circle);
    });
    if (located.length > 0 && !fitDoneRef.current) {
      try {
        const bounds = (window as any).L.latLngBounds(located.map((r) => [r.lat, r.lon]));
        mapRef.current.fitBounds(bounds.pad(0.2), { maxZoom: 10, animate: false });
        fitDoneRef.current = true;
      } catch {}
    }
  }, [reports, onSelectReport]);

  useEffect(() => {
    if (pickReset === undefined) return;
    if (pendingPinRef.current) { pendingPinRef.current.remove(); pendingPinRef.current = null; }
  }, [pickReset]);

  useEffect(() => {
    if (!flyTo || !mapRef.current) return;
    if (flyToPrevRef.current?.[0] === flyTo[0] && flyToPrevRef.current?.[1] === flyTo[1]) return;
    flyToPrevRef.current = flyTo;
    const zoom = Math.max(mapRef.current.getZoom(), 13);
    mapRef.current.flyTo(flyTo, zoom, { duration: 0.8 });
  }, [flyTo]);

  useEffect(() => {
    if (!resetView || !mapRef.current) return;
    if (resetView === resetViewPrevRef.current) return;
    resetViewPrevRef.current = resetView;
    flyToPrevRef.current = null;
    fitDoneRef.current = false;
    mapRef.current.flyTo([20, 0], 2, { duration: 1.2 });
  }, [resetView]);

  return <div ref={containerRef} className="absolute inset-0" />;
}

/* ─── Welcome Modal ─────────────────────────────────────────── */
type TShape = typeof import("../i18n/translations").T["en"];

function WelcomeModal({
  dataReady, t, onDismiss,
}: { dataReady: boolean; t: TShape; onDismiss: () => void }) {
  const steps = [
    { icon: "📍", title: t.welcomeStep1Title, desc: t.welcomeStep1Desc },
    { icon: "⚠️", title: t.welcomeStep2Title, desc: t.welcomeStep2Desc },
    { icon: "🗺️", title: t.welcomeStep3Title, desc: t.welcomeStep3Desc },
  ];
  return (
    <div className="fixed inset-0 z-[9000] flex items-end justify-center bg-foreground/30 backdrop-blur-sm sm:items-center p-4">
      <div className="w-full max-w-sm overflow-hidden rounded-[2rem] border border-border bg-card shadow-[var(--shadow-hero)]">
        <div className={`h-1.5 w-full ${dataReady ? "bg-success" : "bg-[var(--color-gold)] animate-pulse"}`} />
        <div className="p-6 space-y-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-accent">{t.welcomeTag}</p>
            <h2 className="font-display text-2xl font-bold text-primary mt-1">{t.welcomeHeadline}</h2>
            <p className="text-sm text-muted-foreground mt-1">{t.welcomeSub}</p>
          </div>
          <div className="space-y-2">
            {steps.map((s, i) => (
              <div key={i} className="flex items-start gap-3 rounded-2xl bg-secondary px-4 py-3">
                <span className="mt-0.5 shrink-0 text-xl">{s.icon}</span>
                <div>
                  <div className="text-xs font-bold text-primary">{s.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 pt-1">
            {dataReady
              ? <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-success"><span className="h-2 w-2 rounded-full bg-success" />{t.welcomeReady}</span>
              : <span className="flex animate-pulse items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-warn"><span className="h-2 w-2 rounded-full bg-warn" />{t.welcomeLoading}</span>
            }
            <button type="button" onClick={onDismiss}
              className="ml-auto rounded-full bg-[var(--color-gold)] px-5 py-2.5 text-xs font-bold text-primary transition hover:brightness-105">
              {t.welcomeBtn}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Report Flow Modal ──────────────────────────────────────── */
function ReportFlowModal({
  onClose, onReported, initialPlace,
}: {
  onClose: () => void;
  onReported: () => void;
  initialPlace?: Place;
}) {
  const [step, setStep] = useState<"location" | "form">(initialPlace ? "form" : "location");
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(initialPlace ?? null);

  function handlePlaceSelected(p: Place) {
    setSelectedPlace(p);
    setStep("form");
  }

  return (
    <div className="fixed inset-0 z-[9000] flex items-end sm:items-center justify-center bg-foreground/40 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex h-[min(580px,calc(100dvh-env(safe-area-inset-bottom)))] sm:h-[min(560px,calc(100dvh-2rem))] w-full sm:max-w-sm flex-col overflow-hidden rounded-t-[2rem] sm:rounded-[2rem] border border-border bg-card shadow-[var(--shadow-hero)]"
      >
        {step === "location" ? (
          <LocationPickerStep onSelect={handlePlaceSelected} onClose={onClose} />
        ) : selectedPlace ? (
          <ReportFormStep place={selectedPlace} onBack={() => setStep("location")} onClose={onClose} onReported={onReported} />
        ) : null}
      </div>
    </div>
  );
}

function LocationPickerStep({ onSelect, onClose }: { onSelect: (p: Place) => void; onClose: () => void }) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const { results, loading } = usePhotonSearch(query);
  const [open, setOpen] = useState(false);

  async function detectLocation() {
    if (!navigator.geolocation) { setGeoError(t.geoNotSupported); return; }
    setGeoLoading(true); setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const place = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        setGeoLoading(false);
        if (!place) { setGeoError(t.geoCantResolve); return; }
        onSelect(place);
      },
      (err) => { setGeoLoading(false); setGeoError(err.message || t.geoPermDenied); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border/60 px-6 py-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-accent">{t.step1of2}</p>
            <h2 className="font-display mt-0.5 text-xl font-bold text-primary">{t.whereAreYou}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{t.searchLocalityHint}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-muted-foreground hover:text-foreground">✕</button>
        </div>
      </div>
      <div className="no-scrollbar flex-1 overflow-y-auto px-6 py-5">
        <div className="space-y-3">
          <div className="relative">
            <input
              type="text" value={query}
              onFocus={() => setOpen(true)}
              onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
              placeholder={t.searchPlaceholder}
              className="w-full rounded-2xl border border-border bg-background py-3 pl-4 pr-4 text-sm text-primary placeholder:text-primary/40 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
            {open && query.trim().length >= 2 && (
              <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
                {loading && <div className="px-4 py-2 text-xs text-muted-foreground">{t.searchingPlaces}</div>}
                {!loading && results.length === 0 && <div className="px-4 py-2 text-xs text-muted-foreground">{t.noPlacesFound}</div>}
                {results.map((p, i) => (
                  <button key={`${p.lat}-${p.lon}-${i}`} type="button"
                    onClick={() => { onSelect(p); setOpen(false); }}
                    className="w-full border-b border-border/50 px-4 py-3 text-left transition last:border-0 hover:bg-secondary">
                    <div className="text-sm font-bold text-primary">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.context}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" onClick={detectLocation} disabled={geoLoading}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--color-gold)]/30 bg-[var(--color-gold)]/10 py-3 text-sm font-bold text-primary transition hover:bg-[var(--color-gold)]/20 disabled:opacity-50">
            📍 {geoLoading ? t.detecting : t.useMyLocation}
          </button>
          {geoError && <p className="text-xs font-semibold text-destructive">{geoError}</p>}
        </div>
      </div>
    </div>
  );
}

function ReportFormStep({ place, onBack, onClose, onReported }: { place: Place; onBack: () => void; onClose: () => void; onReported: () => void }) {
  const { t } = useLanguage();
  const [severity, setSeverity] = useState<Severity>("warn");
  const [category, setCategory] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pickImage(f: File | null) {
    setImageFile(f);
    setImagePreview(f ? URL.createObjectURL(f) : null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = message.trim();
    if (!category) { setError(t.errSelectCategory); return; }
    if (!trimmed) { setError(t.errDescribeHappened); return; }
    if (imageFile && imageFile.size > 5 * 1024 * 1024) { setError(t.errImageSize); return; }
    setSubmitting(true); setError(null);
    try {
      const res = await fetch(`${API_BASE}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reporter_name: "Anonymous",
          content: trimmed,
          severity,
          category,
          latitude: place.lat,
          longitude: place.lon,
          locality: place.name,
          country: place.country,
          state: null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError((err as { detail?: string }).detail || t.errSubmissionFailed);
        setSubmitting(false);
        return;
      }
      const created = await res.json() as { id: number };
      if (imageFile) {
        const fd = new FormData();
        fd.append("file", imageFile);
        await fetch(`${API_BASE}/reports/${created.id}/images`, { method: "POST", body: fd });
      }
      onClose();
      onReported();
    } catch {
      setError(t.errNetworkError);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border/60 px-6 py-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-accent">{t.step2of2}</p>
            <h2 className="font-display mt-0.5 text-xl font-bold text-primary">{place.name}</h2>
            <p className="text-xs text-muted-foreground">{place.context}</p>
          </div>
          <button type="button" onClick={onBack} className="text-xs font-bold text-accent hover:underline">← {t.backToList}</button>
        </div>
      </div>
      <div className="no-scrollbar flex-1 space-y-4 overflow-y-auto px-6 py-5">
        <div className="no-scrollbar -mx-6 flex gap-2 overflow-x-auto px-6 pb-1">
          {Object.entries(CATEGORY_META).map(([k, v]) => (
            <button key={k} type="button" onClick={() => setCategory(k)}
              className={`shrink-0 flex flex-col items-center gap-1 rounded-2xl border px-3 py-2 transition ${
                category === k
                  ? "border-[var(--color-gold)]/60 bg-[var(--color-gold)]/15 text-primary"
                  : "border-primary/10 bg-primary/5 text-primary/70"
              }`}>
              <span className="text-lg leading-none">{v.emoji}</span>
              <span className="text-[9px] font-bold uppercase tracking-wider">{t[v.labelKey as keyof typeof t] as string}</span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(["safe", "warn", "critical"] as Severity[]).map((s) => (
            <button key={s} type="button" onClick={() => setSeverity(s)}
              className={`rounded-2xl border py-2.5 text-xs font-bold uppercase tracking-widest transition ${
                severity === s
                  ? s === "critical" ? "border-destructive bg-destructive/10 text-destructive"
                    : s === "warn" ? "border-warn bg-warn/10 text-warn"
                    : "border-success bg-success/10 text-success"
                  : "border-border text-muted-foreground hover:border-foreground/30"
              }`}>
              {s}
            </button>
          ))}
        </div>
        <div>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)}
            rows={4} maxLength={500} placeholder={t.describePlaceholder}
            className="w-full resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm text-primary placeholder:text-primary/40 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
          <div className="mt-1 flex justify-between text-xs text-muted-foreground">
            <span className={error ? "font-semibold text-destructive" : ""}>{error ?? t.visiblePublicly}</span>
            <span>{message.length}/500</span>
          </div>
        </div>
        {imagePreview ? (
          <div className="relative">
            <img src={imagePreview} alt="" className="w-full max-h-40 rounded-2xl border border-border object-cover" />
            <button type="button" onClick={() => pickImage(null)}
              className="absolute right-2 top-2 rounded-full border border-border bg-card px-2 py-1 text-[10px] font-bold">
              {t.removePhoto}
            </button>
          </div>
        ) : (
          <label className="flex cursor-pointer items-center justify-center rounded-2xl border border-dashed border-[var(--color-gold)]/40 py-5 transition hover:bg-[var(--color-gold)]/5">
            <input type="file" accept="image/*" className="hidden" onChange={(e) => pickImage(e.target.files?.[0] ?? null)} />
            <span className="text-xs font-semibold text-muted-foreground">{t.attachPhotoBtn}</span>
          </label>
        )}
      </div>
      <div className="shrink-0 border-t border-border/60 px-6 py-4">
        <div className="flex gap-3">
          <button type="button" onClick={onClose}
            className="flex-1 rounded-2xl border border-border py-3 text-sm font-semibold text-primary transition hover:bg-secondary">
            {t.cancel}
          </button>
          <button type="submit" disabled={submitting}
            className="flex-1 rounded-2xl bg-[var(--color-gold)] py-3 text-sm font-bold text-primary transition hover:brightness-105 disabled:opacity-50">
            {submitting ? t.submitting : t.submitReportBtn}
          </button>
        </div>
      </div>
    </form>
  );
}

/* ─── Standalone Detail Modal ────────────────────────────────── */
function StandaloneDetailModal({ report, onClose }: { report: Report; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-foreground/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[min(640px,calc(100dvh-2rem))] w-full max-w-md flex-col overflow-hidden rounded-[2rem] border border-border bg-card shadow-[var(--shadow-hero)]"
      >
        <ReportDetailPanel report={report} onBack={onClose} />
      </div>
    </div>
  );
}

/* ─── Report Detail Panel ───────────────────────────────────── */
function ReportDetailPanel({ report, onBack }: { report: Report; onBack: () => void }) {
  const { t } = useLanguage();
  const { data, loading } = useReportDetail(report.id);
  const [localCounts, setLocalCounts] = useState<{ confirmed: number; incorrect: number; resolved: number } | null>(null);
  const [voted, setVoted] = useState<string | null>(null);
  const [comments, setComments] = useState<ApiComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [posting, setPosting] = useState(false);
  const anonName = useRef(`user_${Math.random().toString(36).slice(2, 8)}`);
  const cat = catMeta(report.category);

  useEffect(() => {
    if (data) {
      setLocalCounts({ confirmed: data.confirmed_count ?? 0, incorrect: data.incorrect_count ?? 0, resolved: data.resolved_count ?? 0 });
      setComments(data.comments ?? []);
    }
  }, [data]);

  async function vote(kind: "confirm" | "incorrect" | "resolved") {
    if (voted) return;
    setVoted(kind);
    setLocalCounts((c) => c ? { ...c, [kind === "confirm" ? "confirmed" : kind]: c[kind === "confirm" ? "confirmed" : kind as "incorrect" | "resolved"] + 1 } : c);
    await fetch(`${API_BASE}/reports/${report.id}/verifications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, voter_name: null }),
    }).catch(() => {});
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    const text = commentText.trim();
    if (!text) return;
    setPosting(true);
    try {
      const res = await fetch(`${API_BASE}/reports/${report.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author_name: anonName.current, content: text }),
      });
      if (res.ok) {
        setComments((prev) => [...prev, { id: Date.now(), author_name: anonName.current, content: text, created_at: new Date().toISOString() }]);
        setCommentText("");
      }
    } finally { setPosting(false); }
  }

  const imgUrl = data?.images?.[0]?.file_path
    ? `${UPLOADS_ORIGIN}/uploads/${data.images[0].file_path}`
    : report.image_url;

  const [imgExpanded, setImgExpanded] = useState(false);

  return (
    <>
      {imgExpanded && imgUrl && (
        <div className="fixed inset-0 z-[9500] flex items-center justify-center bg-black/90 p-4" onClick={() => setImgExpanded(false)}>
          <img src={imgUrl} alt="" className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl" />
          <button type="button" onClick={() => setImgExpanded(false)}
            className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-white/20 text-white hover:bg-white/30">✕</button>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-border/60 px-5 py-3.5">
          <div className="flex items-center justify-between">
            <button type="button" onClick={onBack} className="text-xs font-bold text-accent hover:underline">← {t.backToList}</button>
            <div className="flex items-center gap-2">
              <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${sevBadge(report.severity)}`}>{report.severity}</span>
              <span className="rounded-lg bg-secondary px-2.5 py-1 text-[10px] font-bold text-primary">{cat.emoji} {t[cat.labelKey as keyof typeof t] as string}</span>
            </div>
          </div>
        </div>
        <div className="no-scrollbar flex-1 overflow-y-auto">
          {imgUrl && (
            <button type="button" onClick={() => setImgExpanded(true)}
              className="group relative block w-full shrink-0 overflow-hidden border-b border-border/60">
              <img src={imgUrl} alt="" className="w-full max-h-52 object-cover transition group-hover:brightness-90" />
              <span className="absolute bottom-2 right-2 rounded-lg bg-black/50 px-2 py-1 text-[10px] font-bold text-white">{t.tapToExpand}</span>
            </button>
          )}
          <div className="px-5 py-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary font-display text-xs font-bold text-primary">
                {reportInitials(report.id)}
              </div>
              <div>
                <p className="text-xs font-bold text-primary">neighbor_{report.id.slice(-5)}</p>
                <p className="text-[11px] text-muted-foreground">
                  {formatReportTime(report.created_at)}
                  {report.place && <> · {report.place}</>}
                  {report.district && <> · {report.district}</>}
                </p>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-primary">{report.message}</p>
          </div>
          {loading ? (
            <div className="px-5 py-4 text-xs text-muted-foreground animate-pulse">Loading details…</div>
          ) : localCounts && (
            <div className="px-5 pb-4">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t.communityVotesLabel}</p>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { kind: "confirm" as const, label: t.confirm, count: localCounts.confirmed, active: "border-success bg-success/10 text-success", base: "border-border text-muted-foreground hover:border-success/50" },
                  { kind: "incorrect" as const, label: t.incorrect, count: localCounts.incorrect, active: "border-destructive bg-destructive/10 text-destructive", base: "border-border text-muted-foreground hover:border-destructive/50" },
                  { kind: "resolved" as const, label: t.resolved, count: localCounts.resolved, active: "border-accent bg-accent/10 text-accent", base: "border-border text-muted-foreground hover:border-accent/50" },
                ]).map(({ kind, label, count, active, base }) => (
                  <button key={kind} type="button" disabled={!!voted} onClick={() => vote(kind)}
                    className={`rounded-2xl border py-3 text-[10px] font-bold uppercase tracking-wider transition disabled:cursor-default ${voted === kind ? active : voted ? "border-border text-muted-foreground/30" : base}`}>
                    <span className="block text-2xl font-extrabold tabular-nums leading-none">{count}</span>
                    <span className="mt-0.5 block text-[9px]">{label}{voted === kind && " ✓"}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="px-5 py-4">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t.discussionHd.replace("💬 ", "")}</p>
            {comments.length === 0 ? (
              <p className="text-xs italic text-muted-foreground/60">{t.noCommentsYet}</p>
            ) : (
              <div className="space-y-2">
                {comments.map((c) => (
                  <div key={c.id} className="rounded-xl border border-border bg-secondary px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-accent">{c.author_name} · {formatReportTime(c.created_at)}</p>
                    <p className="mt-1 text-xs leading-snug text-primary">{c.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="shrink-0 border-t border-border bg-card px-4 py-3">
          <form onSubmit={submitComment} className="flex items-end gap-2">
            <textarea value={commentText} onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (commentText.trim()) submitComment(e as unknown as React.FormEvent); }}}
              rows={2} placeholder={t.commentPlaceholder}
              className="no-scrollbar flex-1 resize-none rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-primary placeholder:text-primary/40 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
            />
            <button type="submit" disabled={posting}
              className="mb-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--color-gold)] text-primary transition hover:brightness-105 disabled:opacity-40">
              {posting ? <span className="text-xs">…</span> : (
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                </svg>
              )}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

/* ─── District Modal ────────────────────────────────────────── */
function DistrictModal({
  district, reports, alerts, onClose,
}: { district: string; reports: Report[]; alerts: OfficialAlert[]; onClose: () => void }) {
  const { t } = useLanguage();
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const places = useMemo(() => Array.from(new Set(reports.map((r) => r.place).filter(Boolean) as string[])), [reports]);
  const [activePlace, setActivePlace] = useState<string | null>(null);
  const visibleReports = activePlace ? reports.filter((r) => r.place === activePlace) : reports;

  const sev = maxSeverity([...reports.map((r) => ({ severity: r.severity })), ...alerts.map((a) => ({ severity: a.severity }))]);
  const headline = alerts.find((a) => a.severity === "critical")?.disasterType ?? alerts[0]?.disasterType ?? (reports.length > 0 ? t.communityReportsActive : t.noActiveIncidents);

  return (
    <div className="fixed inset-0 z-[9000] flex items-end justify-center bg-foreground/30 backdrop-blur-sm p-3 sm:items-center sm:p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-[2rem] border border-primary/10 bg-card shadow-[var(--shadow-hero)]"
        style={{ maxHeight: "88vh" }}
      >
        <div className={`h-1.5 w-full shrink-0 ${sev === "critical" ? "bg-destructive" : sev === "warn" ? "bg-warn" : "bg-success"}`} />
        <div className="shrink-0 border-b border-border px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-accent">{t.dossierLabel}</p>
              <h2 className="font-display text-2xl font-bold text-primary mt-0.5">{district}</h2>
              <p className="text-xs text-muted-foreground">{headline}</p>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <div className="text-right">
                <div className={`font-display text-xl font-bold ${sevText(sev)}`}>{alerts.length}</div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{t.officialLabel}</div>
              </div>
              <div className="text-right">
                <div className="font-display text-xl font-bold text-accent">{reports.length}</div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{t.crowdLabel}</div>
              </div>
              <button type="button" onClick={onClose} className="text-xs font-bold text-muted-foreground hover:text-foreground">✕</button>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-border">
          {alerts.length > 0 && (
            <section className="px-5 py-4">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t.officialAdvisories}</p>
              <div className="space-y-2">
                {alerts.map((a) => (
                  <div key={a.id} className={`rounded-2xl border-l-2 py-2.5 pl-3 pr-3 text-xs ${sevBorderL(a.severity)} ${a.severity === "critical" ? "bg-destructive/5" : a.severity === "warn" ? "bg-warn/5" : "bg-success/5"}`}>
                    <div className={`font-bold ${sevText(a.severity)}`}>{a.severityLabel} · {a.disasterType}</div>
                    <div className="text-muted-foreground">{a.source}</div>
                    {a.message && <p className="mt-1 text-foreground/80 line-clamp-2">{a.message}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}
          <section className="px-5 py-4">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t.crowdBriefs} ({visibleReports.length})</p>
            {places.length > 0 && (
              <div className="no-scrollbar -mx-5 flex gap-1.5 overflow-x-auto px-5 pb-2">
                <button type="button" onClick={() => setActivePlace(null)}
                  className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition ${activePlace === null ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-primary"}`}>
                  {t.allPlaces}
                </button>
                {places.map((p) => (
                  <button key={p} type="button" onClick={() => setActivePlace(p)}
                    className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition ${activePlace === p ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-primary"}`}>
                    {p}
                  </button>
                ))}
              </div>
            )}
            <div className="space-y-2">
              {visibleReports.length === 0 ? (
                <p className="py-6 text-center text-xs italic text-muted-foreground">{t.noCrowdReportsYet}</p>
              ) : (
                visibleReports.map((r) => (
                  <button key={r.id} type="button" onClick={() => setSelectedReport(r)}
                    className="flex w-full items-start gap-3 rounded-2xl border border-primary/8 bg-background p-3 text-left transition hover:bg-secondary">
                    <span className="mt-0.5 shrink-0 text-lg">{catMeta(r.category).emoji}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className={`font-bold ${sevText(r.severity)}`}>{r.severity.toUpperCase()}</span>
                        <span>·</span><span>{r.place ?? r.district}</span>
                        <span className="ml-auto">{formatReportTime(r.created_at)}</span>
                      </div>
                      <p className="mt-0.5 text-sm text-primary leading-snug line-clamp-2">{r.message}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>
        </div>
        {selectedReport && (
          <div className="absolute inset-0 z-10 overflow-hidden rounded-[2rem] border-t-2 border-accent bg-card">
            <ReportDetailPanel report={selectedReport} onBack={() => setSelectedReport(null)} />
          </div>
        )}
      </div>
    </div>
  );
}
