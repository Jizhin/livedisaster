import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "../i18n/LanguageContext";

/* ─── Types ─────────────────────────────────────────────────── */
type Severity = "safe" | "warn" | "critical";

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
    name?: string; city?: string; county?: string;
    state?: string; country?: string; district?: string;
  };
};

type Place = {
  name: string; context: string; lat: number; lon: number;
  country: string; city: string | null;
};

type ApiReport = {
  id: number; district_name: string | null; district_slug: string | null;
  locality: string | null; latitude: number | null; longitude: number | null;
  created_at: string; content: string; severity: string; category: string | null;
  country: string | null; images: Array<{ file_path: string }>;
};

type ApiComment = { id: number; author_name: string; content: string; created_at: string };
type ApiReportDetail = ApiReport & {
  confirmed_count?: number; incorrect_count?: number; resolved_count?: number;
  comment_count?: number; views_count?: number; status?: string;
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

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000/api";
const UPLOADS_ORIGIN = API_BASE.replace(/\/api$/, "");
const WELCOME_KEY = "lk_welcome_done";

const SEV = {
  critical: { dot: "bg-red-500", chip: "bg-red-50 text-red-700 border-red-200", text: "text-red-600", bar: "bg-red-500", color: "#ef4444", label: "Critical" },
  warn:     { dot: "bg-amber-500", chip: "bg-amber-50 text-amber-700 border-amber-200", text: "text-amber-600", bar: "bg-amber-500", color: "#f59e0b", label: "Warning" },
  safe:     { dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 border-emerald-200", text: "text-emerald-600", bar: "bg-emerald-500", color: "#10b981", label: "Safe" },
};

const TILE_LAYERS = {
  streets:   { url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",  sub: "abcd", maxZ: 19, attr: "© OpenStreetMap, © CARTO", label: "Streets",   icon: "🗺" },
  terrain:   { url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",                        sub: "abc",  maxZ: 17, attr: "© OpenStreetMap, SRTM | OpenTopoMap (CC-BY-SA)", label: "Terrain",   icon: "⛰" },
  satellite: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", sub: null, maxZ: 18, attr: "Tiles © Esri", label: "Satellite", icon: "🛰" },
} as const;
type TileKey = keyof typeof TILE_LAYERS;

/* ─── Helpers ───────────────────────────────────────────────── */
function toPlace(f: PhotonFeature): Place {
  const p = f.properties;
  const [lon, lat] = f.geometry.coordinates;
  const country = p.country ?? "Unknown";
  const city = p.city ?? p.county ?? null;
  const ctxParts = [p.city, p.county, p.state, p.country].filter(Boolean) as string[];
  return { name: p.name ?? city ?? "Unknown", context: Array.from(new Set(ctxParts)).join(" · ") || country, lat, lon, country, city };
}

function mapApiReport(r: ApiReport): Report {
  return {
    id: String(r.id), district: r.district_name ?? r.country ?? "",
    place: r.locality ?? null, lat: r.latitude ?? null, lon: r.longitude ?? null,
    created_at: r.created_at, message: r.content,
    severity: (r.severity as Severity) ?? "warn", category: r.category ?? null,
    image_url: r.images?.[0]?.file_path ? `${UPLOADS_ORIGIN}/uploads/${r.images[0].file_path}` : null,
  };
}

function formatReportTime(iso: string) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function catMeta(c: string | null) {
  return CATEGORY_META[c ?? ""] ?? { emoji: "📌", labelKey: "catOther" };
}

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
        const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6`, { signal: ctrl.signal });
        const data: { features: PhotonFeature[] } = await res.json();
        setResults((data.features ?? []).map(toPlace));
      } catch { /* ignore */ } finally { setLoading(false); }
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
    return f ? toPlace(f) : null;
  } catch { return null; }
}

function useReportDetail(reportId: string | null) {
  const [data, setData] = useState<ApiReportDetail | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!reportId) { setData(null); return; }
    setLoading(true);
    fetch(`${API_BASE}/reports/${reportId}`)
      .then(r => r.json()).then((d: ApiReportDetail) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [reportId]);
  return { data, loading };
}

function useLiveReports(limit = 50) {
  const [reports, setReports] = useState<Report[]>([]);
  const [status, setStatus] = useState<"connecting" | "live" | "offline">("connecting");
  const [waking, setWaking] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const prevIdsRef = useRef<Set<string>>(new Set());
  const liveRef = useRef(false);
  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  useEffect(() => {
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    liveRef.current = false;

    // Show "waking up" hint after 3s if still not live
    const wakingTimer = setTimeout(() => {
      if (active && !liveRef.current) setWaking(true);
    }, 3000);

    async function fetchOnce(): Promise<boolean> {
      try {
        const res = await fetch(`${API_BASE}/reports/feed?limit=${limit}`);
        if (!res.ok) throw new Error(`${res.status}`);
        const raw: ApiReport[] = await res.json();
        if (!active) return false;
        const mapped = raw.map(mapApiReport);
        const newOnes = mapped.filter(r => !prevIdsRef.current.has(r.id));
        if (newOnes.length > 0 && prevIdsRef.current.size > 0) {
          setFlashId(newOnes[0].id);
          setTimeout(() => setFlashId(id => id === newOnes[0].id ? null : id), 4000);
        }
        prevIdsRef.current = new Set(mapped.map(r => r.id));
        setReports(mapped);
        setStatus("live");
        setWaking(false);
        liveRef.current = true;
        attempt = 0;
        return true;
      } catch {
        if (active) setStatus(prevIdsRef.current.size > 0 ? "offline" : "connecting");
        return false;
      }
    }

    async function fetchWithRetry() {
      const ok = await fetchOnce();
      if (!ok && active) {
        attempt++;
        // 5s → 10s → 15s → 20s → 30s max backoff
        const delay = Math.min(5000 * attempt, 30000);
        retryTimer = setTimeout(fetchWithRetry, delay);
      }
    }

    fetchWithRetry();
    const interval = setInterval(() => { if (active) fetchOnce(); }, 20000);

    return () => {
      active = false;
      clearInterval(interval);
      clearTimeout(wakingTimer);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [limit, refreshKey]);

  return { reports, status, waking, flashId, refresh };
}

// Ping /health every 10 min so Render never hits 15-min inactivity sleep
function useKeepAlive() {
  useEffect(() => {
    const ping = () => fetch(`${UPLOADS_ORIGIN}/health`).catch(() => {});
    ping();
    const id = setInterval(ping, 10 * 60 * 1000);
    return () => clearInterval(id);
  }, []);
}

function useKeralaAlerts() {
  const [alerts, setAlerts] = useState<OfficialAlert[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    let active = true;
    const load = () => {
      fetch(`${API_BASE}/ndma-alerts`)
        .then(r => r.json()).then((d: OfficialAlert[]) => { if (!active) return; setAlerts(d); setStatus("ready"); })
        .catch(() => { if (active) setStatus("error"); });
    };
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => { active = false; clearInterval(id); };
  }, []);
  return { alerts, status };
}

/* ─── Loading Screen ────────────────────────────────────────── */
const LOADING_MSG_KEYS = [
  { h: "loadMsg1h", s: "loadMsg1s" }, { h: "loadMsg2h", s: "loadMsg2s" },
  { h: "loadMsg3h", s: "loadMsg3s" }, { h: "loadMsg4h", s: "loadMsg4s" },
  { h: "loadMsg5h", s: "loadMsg5s" }, { h: "loadMsg6h", s: "loadMsg6s" },
] as const;

function LoadingScreen({ fading, waking }: { fading: boolean; waking: boolean }) {
  const { t } = useLanguage();
  const [idx, setIdx] = useState(0);
  const [vis, setVis] = useState(true);
  useEffect(() => {
    const id = setInterval(() => {
      setVis(false);
      setTimeout(() => { setIdx(i => (i + 1) % LOADING_MSG_KEYS.length); setVis(true); }, 350);
    }, 2400);
    return () => clearInterval(id);
  }, []);
  const keys = LOADING_MSG_KEYS[idx];
  return (
    <div className={`fixed inset-0 z-[9000] flex flex-col items-center justify-center bg-foreground px-8 transition-opacity duration-700 ${fading ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
      <div className="relative flex w-full max-w-xs flex-col items-center text-center">
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-primary to-accent text-white shadow-xl mb-5">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-8 w-8">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
        </div>
        <div className="font-display text-2xl font-bold text-white">Disaster<span className="text-primary">Watch</span></div>
        <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/40">Community · Live · Global</p>
        <div className="mt-8 flex items-center gap-2 mb-10">
          {[0,1,2,3,4].map(i => (
            <span key={i} className="rounded-full bg-primary" style={{ width: i===2?"0.625rem":"0.375rem", height: i===2?"0.625rem":"0.375rem", opacity: i===2?1:0.4, animation:`live-pulse 1.6s ease-out ${i*0.15}s infinite` }} />
          ))}
        </div>
        {waking ? (
          <div className="min-h-[5rem]">
            <p className="font-display text-[18px] font-bold leading-snug text-amber-300">Server is waking up…</p>
            <p className="mt-2.5 text-sm leading-relaxed text-white/60">
              The server was idle and is starting back up.<br />This takes about 30–60 seconds on Render's free tier.
            </p>
          </div>
        ) : (
          <div className="min-h-[5rem] transition-opacity duration-300" style={{ opacity: vis ? 1 : 0 }}>
            <p className="font-display text-[18px] font-bold leading-snug text-white">{t[keys.h as keyof typeof t] as string}</p>
            <p className="mt-2.5 text-sm leading-relaxed text-white/60">{t[keys.s as keyof typeof t] as string}</p>
          </div>
        )}
        <div className="mt-8 h-1 w-48 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-primary" style={{ animation: "loading-bar 2.4s ease-in-out infinite" }} />
        </div>
      </div>
      <div className="absolute bottom-10 flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">
        <span className={waking ? "h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" : "live-dot"} />
        {waking ? "Retrying connection…" : t.welcomeLoading}
      </div>
      <style>{`@keyframes loading-bar { 0%{width:0%;margin-left:0%} 50%{width:60%;margin-left:20%} 100%{width:0%;margin-left:100%} }`}</style>
    </div>
  );
}

/* ─── Connecting Banner ─────────────────────────────────────── */
const CONNECT_MSGS = [
  { icon: "🌍", text: "Your eyes on the ground keep communities safe. We're syncing the live feed…" },
  { icon: "🤝", text: "Every report you share helps someone nearby make a better decision." },
  { icon: "📡", text: "Pulling live data from around the world. Hang tight — this takes a moment." },
  { icon: "🛡", text: "Together, we build a more resilient world. Connecting to the live network…" },
  { icon: "💬", text: "Thousands of community members report what they see in real time. Loading…" },
  { icon: "⚡", text: "Real-time. Community-powered. No algorithm, no delay. Connecting…" },
];

function ConnectingBanner() {
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * CONNECT_MSGS.length));
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const id = setInterval(() => {
      setVisible(false);
      setTimeout(() => { setIdx(i => (i + 1) % CONNECT_MSGS.length); setVisible(true); }, 400);
    }, 3500);
    return () => clearInterval(id);
  }, []);
  const msg = CONNECT_MSGS[idx];
  return (
    <div className="w-full bg-gradient-to-r from-primary/10 via-sky-50 to-accent/10 border-b border-primary/20 px-4 py-3">
      <div className="mx-auto flex max-w-[1400px] items-center justify-center gap-3"
        style={{ opacity: visible ? 1 : 0, transition: "opacity 0.35s ease" }}>
        <span className="text-lg shrink-0">{msg.icon}</span>
        <p className="text-sm font-medium text-foreground/80 text-center">{msg.text}</p>
        <span className="shrink-0 flex items-center gap-1">
          {[0,1,2].map(i => (
            <span key={i} className="h-1.5 w-1.5 rounded-full bg-primary"
              style={{ animation: `live-pulse 1.4s ease-out ${i * 0.2}s infinite` }} />
          ))}
        </span>
      </div>
    </div>
  );
}

/* ─── Site Nav ──────────────────────────────────────────────── */
function SiteNav({ onReport, reportsCount, status }: {
  onReport: () => void;
  reportsCount: number;
  status: "connecting" | "live" | "offline";
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center gap-4 px-4 md:px-6">
        <a href="/" className="flex items-center gap-2.5 shrink-0">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-accent text-white shadow-soft grid place-items-center shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-5 w-5">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <div className="leading-tight">
            <div className="font-display font-bold text-base text-foreground">DisasterWatch</div>
            <div className="hidden sm:block text-[10px] uppercase tracking-widest text-muted-foreground">Crowdsourced disaster watch</div>
          </div>
        </a>

        <nav className="ml-4 hidden md:flex items-center gap-0.5">
          {[["#map","Live map"],["#feed","Reports"],["#alerts","Alerts"],["#how","How it works"]].map(([href, label]) => (
            <a key={href} href={href} className="rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
              {label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <span className={`hidden sm:inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold ${status === "live" ? "border-success/30 bg-success/10 text-success" : status === "offline" ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-muted-foreground/30 bg-muted text-muted-foreground"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${status === "live" ? "bg-success animate-pulse" : status === "offline" ? "bg-destructive" : "bg-muted-foreground animate-pulse"}`} />
            {status === "live" ? `LIVE · ${reportsCount}` : status === "offline" ? "OFFLINE" : "CONNECTING"}
          </span>
          <button className="h-9 w-9 rounded-full hover:bg-secondary flex items-center justify-center text-muted-foreground text-base transition-colors" title="Language">🌐</button>
          <button className="h-9 w-9 rounded-full hover:bg-secondary flex items-center justify-center text-muted-foreground text-base transition-colors" title="Alerts">🔔</button>
          <button onClick={onReport} className="inline-flex items-center gap-1.5 rounded-full bg-foreground text-background px-4 py-2 text-sm font-semibold shadow-soft hover:opacity-90 transition-opacity">
            <span className="text-base leading-none">+</span> Report
          </button>
        </div>
      </div>
    </header>
  );
}

/* ─── Incident Card ─────────────────────────────────────────── */
function IncidentCard({ report, compact = false, flash = false, onSelect }: {
  report: Report; compact?: boolean; flash?: boolean; onSelect: () => void;
}) {
  const { t } = useLanguage();
  const sev = SEV[report.severity];
  const cat = catMeta(report.category);
  return (
    <article
      onClick={onSelect}
      className={`group cursor-pointer overflow-hidden rounded-2xl border border-border bg-card transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-float ${flash ? "ring-2 ring-primary/30" : ""}`}
    >
      {report.image_url && !compact && (
        <div className="relative h-36 w-full overflow-hidden">
          <img src={report.image_url} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
          <div className="absolute left-3 top-3">
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold bg-white/95 backdrop-blur ${sev.chip}`}>
              <span className={`inline-block h-1.5 w-1.5 rounded-full mr-1 ${sev.dot}`} />{sev.label}
            </span>
          </div>
        </div>
      )}
      <div className={compact ? "p-3" : "p-4"}>
        <div className="flex items-center gap-1.5 flex-wrap">
          {(compact || !report.image_url) && (
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold flex items-center gap-1 ${sev.chip}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${sev.dot}`} />{sev.label}
            </span>
          )}
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
            {cat.emoji} {t[cat.labelKey as keyof typeof t] as string}
          </span>
          <span className="ml-auto text-[11px] text-muted-foreground shrink-0">{formatReportTime(report.created_at)}</span>
        </div>
        <p className={`mt-2 text-sm leading-relaxed text-foreground ${compact ? "line-clamp-2" : "line-clamp-3"}`}>{report.message}</p>
        <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
          <span className="shrink-0">📍</span>
          <span className="truncate">{report.place ? `${report.place}, ${report.district}` : report.district}</span>
        </div>
        {!compact && (
          <div className="mt-3 border-t border-border pt-3 flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-secondary grid place-items-center text-[11px] font-bold text-muted-foreground shrink-0">
              {String(report.id).slice(-2)}
            </div>
            <span className="text-xs font-semibold text-foreground truncate">Community member</span>
            <div className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="text-emerald-600">👍 0</span>
              <span className="text-blue-600">✓ 0</span>
              <span>💬 0</span>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

/* ─── Alert Card ────────────────────────────────────────────── */
function AlertCard({ alert }: { alert: OfficialAlert }) {
  const sev = SEV[alert.severity] ?? SEV.warn;
  return (
    <article className="relative overflow-hidden rounded-2xl border border-border bg-card p-4 hover:shadow-soft transition-shadow">
      <div className={`absolute inset-y-0 left-0 w-1.5 rounded-l-2xl ${sev.bar}`} />
      <div className="pl-3 flex items-start gap-3">
        <div className={`h-9 w-9 rounded-xl grid place-items-center shrink-0 ${sev.chip}`}>
          <span className="text-base">⚠️</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground leading-snug">
              {alert.disasterType} — {alert.severityLabel}
            </h3>
            <span className="text-[11px] text-muted-foreground shrink-0">{alert.effectiveStart ? formatReportTime(alert.effectiveStart) : ""}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground line-clamp-3 leading-relaxed">{alert.message || alert.areaDescription}</p>
          <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
            <span>📍</span>
            <span className="truncate">{alert.district || alert.areaDescription}</span>
            <span className="mx-1">·</span>
            <span>{alert.source}</span>
          </div>
        </div>
      </div>
    </article>
  );
}

/* ─── Live Map ──────────────────────────────────────────────── */
function LiveMap({ reports, flyTo, resetView, onMapPick, onSelectReport, pickReset }: {
  reports: Report[];
  flyTo?: [number, number] | null;
  resetView?: number;
  onMapPick?: (lat: number, lon: number) => void;
  onSelectReport: (r: Report) => void;
  pickReset?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const tileRef = useRef<any>(null);
  const fitDoneRef = useRef(false);
  const pendingPinRef = useRef<any>(null);
  const onMapPickRef = useRef(onMapPick);
  onMapPickRef.current = onMapPick;
  const flyToPrevRef = useRef<[number, number] | null>(null);
  const resetViewPrevRef = useRef(0);

  const [activeLayer, setActiveLayer] = useState<TileKey>("streets");
  const [searchQ, setSearchQ] = useState("");
  const { results: searchResults, loading: searchLoading } = usePhotonSearch(searchQ);
  const [searchOpen, setSearchOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function h(e: MouseEvent) {
      if (!searchBoxRef.current?.contains(e.target as Node)) setSearchOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Map init
  useEffect(() => {
    const L = (window as any).L;
    if (!containerRef.current || mapRef.current || !L) return;

    const map = L.map(containerRef.current, {
      center: [15, 30], zoom: 3,
      attributionControl: false, zoomControl: false,
      scrollWheelZoom: false, worldCopyJump: true,
    });

    const cfg = TILE_LAYERS.streets;
    tileRef.current = L.tileLayer(cfg.url, {
      subdomains: cfg.sub ?? [], maxZoom: cfg.maxZ, attribution: cfg.attr,
    }).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.control.attribution({ prefix: false, position: "bottomright" }).addTo(map);

    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    map.on("click", (e: any) => {
      if (!onMapPickRef.current) return;
      const { lat, lng } = e.latlng;
      if (pendingPinRef.current) { pendingPinRef.current.remove(); pendingPinRef.current = null; }
      const L2 = (window as any).L;
      pendingPinRef.current = L2.circleMarker([lat, lng], {
        radius: 10, fillColor: "#3b82f6", color: "#fff", weight: 3, fillOpacity: 0.9,
      }).addTo(map);
      onMapPickRef.current(lat, lng);
    });

    return () => {
      map.remove();
      mapRef.current = null; layerRef.current = null; tileRef.current = null;
      fitDoneRef.current = false; pendingPinRef.current = null;
    };
  }, []);

  // Tile layer switch
  useEffect(() => {
    const L = (window as any).L;
    if (!mapRef.current || !tileRef.current || !L) return;
    tileRef.current.remove();
    const cfg = TILE_LAYERS[activeLayer];
    tileRef.current = L.tileLayer(cfg.url, {
      subdomains: cfg.sub ?? [], maxZoom: cfg.maxZ, attribution: cfg.attr,
    }).addTo(mapRef.current);
  }, [activeLayer]);

  // Markers
  useEffect(() => {
    const L = (window as any).L;
    if (!L || !mapRef.current || !layerRef.current) return;
    layerRef.current.clearLayers();
    const located = reports.filter(r => r.lat !== null && r.lon !== null);
    located.forEach(r => {
      const sc = SEV[r.severity];
      const col = sc.color;
      const isPulse = r.severity === "critical";
      const icon = L.divIcon({
        className: "",
        html: `<div style="position:relative;width:34px;height:34px;">
          ${isPulse ? `<span style="position:absolute;inset:-4px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid ${col};animation:pulse-ring 1.8s ease-out infinite;opacity:0.5;pointer-events:none;"></span>` : ""}
          <div style="width:34px;height:34px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${col};display:grid;place-items:center;box-shadow:0 2px 8px ${col}60;">
            <span style="color:white;font-weight:700;font-size:14px;transform:rotate(45deg);display:block;">!</span>
          </div>
        </div>`,
        iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -32],
      });
      const cat = catMeta(r.category);
      const popup = L.popup({ maxWidth: 280, minWidth: 240 }).setContent(`
        <div style="font-family:Manrope,sans-serif;padding:12px;">
          ${r.image_url ? `<img src="${r.image_url}" style="width:100%;height:110px;object-fit:cover;border-radius:8px;margin-bottom:10px;" />` : ""}
          <div style="color:${col};font-size:11px;letter-spacing:0.06em;text-transform:uppercase;font-weight:700;margin-bottom:4px;">
            ${cat.emoji} ${r.category || ""} · ${sc.label}
          </div>
          <div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:4px;">
            ${r.district}${r.place ? ` · ${r.place}` : ""}
          </div>
          <div style="font-size:12px;color:#475569;line-height:1.5;">
            ${r.message.length > 120 ? r.message.slice(0, 120) + "…" : r.message}
          </div>
          <div style="font-size:11px;color:#94a3b8;margin-top:8px;">${formatReportTime(r.created_at)}</div>
        </div>
      `);
      const marker = L.marker([r.lat, r.lon], { icon });
      marker.bindPopup(popup);
      marker.on("click", () => onSelectReport(r));
      layerRef.current.addLayer(marker);
    });
    if (located.length > 0 && !fitDoneRef.current) {
      try {
        const bounds = L.latLngBounds(located.map((r: Report) => [r.lat, r.lon]));
        mapRef.current.fitBounds(bounds.pad(0.25), { maxZoom: 9, animate: false });
        fitDoneRef.current = true;
      } catch {}
    }
  }, [reports, onSelectReport]);

  // pickReset
  useEffect(() => {
    if (pickReset === undefined) return;
    if (pendingPinRef.current) { pendingPinRef.current.remove(); pendingPinRef.current = null; }
  }, [pickReset]);

  // flyTo
  useEffect(() => {
    if (!flyTo || !mapRef.current) return;
    if (flyToPrevRef.current?.[0] === flyTo[0] && flyToPrevRef.current?.[1] === flyTo[1]) return;
    flyToPrevRef.current = flyTo;
    mapRef.current.flyTo(flyTo, Math.max(mapRef.current.getZoom(), 13), { duration: 0.8 });
  }, [flyTo]);

  // resetView
  useEffect(() => {
    if (!resetView || !mapRef.current) return;
    if (resetView === resetViewPrevRef.current) return;
    resetViewPrevRef.current = resetView;
    flyToPrevRef.current = null; fitDoneRef.current = false;
    mapRef.current.flyTo([15, 30], 3, { duration: 1.2 });
  }, [resetView]);

  function handleLocate() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        const c: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        if (mapRef.current) mapRef.current.flyTo(c, 11, { duration: 0.8 });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  const locatedCount = reports.filter(r => r.lat !== null).length;

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
      {/* Map canvas */}
      <div ref={containerRef} className="absolute inset-0 bg-[#dde7f0]" />

      {/* Floating search bar — centered top */}
      <div ref={searchBoxRef} className="absolute top-4 left-1/2 -translate-x-1/2 z-[500] w-[min(640px,calc(100%-2rem))]">
        <div className="flex items-center gap-2 rounded-full border border-border bg-white/95 shadow-float backdrop-blur pl-4 pr-2 py-2">
          <span className="text-muted-foreground text-sm shrink-0">🔍</span>
          <input
            value={searchQ}
            onChange={e => { setSearchQ(e.target.value); setSearchOpen(true); if (!e.target.value) setSearchOpen(false); }}
            onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
            placeholder="Search a city, street or place worldwide…"
            className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground py-1 min-w-0"
          />
          {searchQ && (
            <button onClick={() => { setSearchQ(""); setSearchOpen(false); }} className="shrink-0 h-5 w-5 rounded-full bg-muted text-muted-foreground text-xs flex items-center justify-center hover:bg-secondary transition-colors">✕</button>
          )}
          {searchLoading && <span className="text-[11px] text-muted-foreground animate-pulse shrink-0">···</span>}
          <button onClick={handleLocate} disabled={locating}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary transition-colors disabled:opacity-60">
            {locating ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" /> : "📍"}
            <span className="hidden sm:inline">{locating ? "Locating…" : "My location"}</span>
          </button>
        </div>
        {searchOpen && searchResults.length > 0 && (
          <div className="absolute left-0 right-0 mt-2 rounded-2xl border border-border bg-white shadow-float overflow-hidden z-10">
            {searchResults.map((p, i) => (
              <button key={`${p.lat}-${p.lon}-${i}`}
                onClick={() => {
                  if (mapRef.current) mapRef.current.flyTo([p.lat, p.lon], 13, { duration: 0.8 });
                  setSearchOpen(false); setSearchQ(p.name);
                }}
                className="w-full text-left px-4 py-2.5 hover:bg-secondary flex items-start gap-3 border-b border-border/60 last:border-b-0 transition-colors">
                <span className="text-primary mt-0.5 shrink-0">📍</span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{p.context}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Layer switcher — right side */}
      <div className="absolute right-4 top-20 z-[500] flex flex-col gap-1 rounded-2xl border border-border bg-white/95 shadow-float backdrop-blur p-1">
        {(Object.keys(TILE_LAYERS) as TileKey[]).map(key => (
          <button key={key} onClick={() => setActiveLayer(key)} title={TILE_LAYERS[key].label}
            className={`flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-[11px] font-semibold transition-colors ${activeLayer === key ? "bg-primary text-white" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
            <span className="text-sm">{TILE_LAYERS[key].icon}</span>
            <span className="hidden md:inline">{TILE_LAYERS[key].label}</span>
          </button>
        ))}
      </div>

      {/* Legend — bottom left */}
      <div className="hidden md:flex absolute bottom-4 left-4 z-[500] items-center gap-3 rounded-full border border-border bg-white/95 shadow-soft backdrop-blur px-4 py-2 text-[11px]">
        <span className="text-muted-foreground">🗂</span>
        {([["critical","#ef4444","Critical"],["warn","#f59e0b","Warning"],["safe","#10b981","Safe"]] as const).map(([,color,label]) => (
          <span key={label} className="flex items-center gap-1 text-foreground font-medium">
            <span className="h-2 w-2 rounded-full" style={{ background: color }} />{label}
          </span>
        ))}
        <span className="text-muted-foreground">· {locatedCount} live</span>
      </div>
    </div>
  );
}

/* ─── Welcome Modal ─────────────────────────────────────────── */
function WelcomeModal({ dataReady, t, onDismiss }: { dataReady: boolean; t: ReturnType<typeof useLanguage>["t"]; onDismiss: () => void }) {
  const steps = [
    { icon: "📷", title: t.welcomeStep1Title, desc: t.welcomeStep1Desc },
    { icon: "⚠️", title: t.welcomeStep2Title, desc: t.welcomeStep2Desc },
    { icon: "🗺️", title: t.welcomeStep3Title, desc: t.welcomeStep3Desc },
  ];
  return (
    <div className="fixed inset-0 z-[9000] flex items-end justify-center bg-foreground/30 backdrop-blur-sm sm:items-center p-4">
      <div className="w-full max-w-sm overflow-hidden rounded-[2rem] border border-border bg-card shadow-float float-in">
        <div className={`h-1.5 w-full ${dataReady ? "bg-success" : "bg-primary animate-pulse"}`} />
        <div className="p-6 space-y-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-primary">{t.welcomeTag}</p>
            <h2 className="font-display text-2xl font-bold text-foreground mt-1">{t.welcomeHeadline}</h2>
            <p className="text-sm text-muted-foreground mt-1">{t.welcomeSub}</p>
          </div>
          <div className="space-y-2">
            {steps.map((s, i) => (
              <div key={i} className="flex items-start gap-3 rounded-2xl bg-secondary px-4 py-3">
                <span className="mt-0.5 shrink-0 text-xl">{s.icon}</span>
                <div>
                  <div className="text-xs font-bold text-foreground">{s.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 pt-1">
            {dataReady
              ? <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-success"><span className="h-2 w-2 rounded-full bg-success" />{t.welcomeReady}</span>
              : <span className="flex animate-pulse items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-primary"><span className="h-2 w-2 rounded-full bg-primary" />{t.welcomeLoading}</span>
            }
            <button onClick={onDismiss} className="ml-auto rounded-full bg-foreground px-5 py-2.5 text-xs font-bold text-background transition hover:opacity-90">
              {t.welcomeBtn}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Home Page ─────────────────────────────────────────────── */
export function HomePage() {
  const { t } = useLanguage();
  useKeepAlive();
  const { reports, status, waking, flashId, refresh } = useLiveReports(50);
  const { alerts, status: alertStatus } = useKeralaAlerts();

  const [activeSeverities, setActiveSeverities] = useState<Set<Severity>>(() => new Set(["critical", "warn", "safe"] as Severity[]));
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [flyTo, setFlyTo] = useState<[number, number] | null>(null);
  const [mapResetView, setMapResetView] = useState(0);

  const [reportFlowOpen, setReportFlowOpen] = useState(false);
  const [mapPickPlace, setMapPickPlace] = useState<Place | null>(null);
  const [mapPickLoading, setMapPickLoading] = useState(false);
  const [mapPickReset, setMapPickReset] = useState(0);
  const [detailReport, setDetailReport] = useState<Report | null>(null);
  const [districtFocus, setDistrictFocus] = useState<string | null>(null);

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

  const categories = useMemo(() => Array.from(new Set(reports.map(r => r.category).filter(Boolean) as string[])), [reports]);

  const filteredReports = useMemo(() => reports.filter(r =>
    activeSeverities.has(r.severity) && (!activeCategory || r.category === activeCategory)
  ), [reports, activeSeverities, activeCategory]);

  const stats = useMemo(() => ({
    active: reports.filter(r => r.severity !== "safe").length,
    critical: reports.filter(r => r.severity === "critical").length,
    today: reports.filter(r => new Date(r.created_at).toDateString() === new Date().toDateString()).length,
  }), [reports]);

  function toggleSeverity(s: Severity) {
    setActiveSeverities(prev => {
      const next = new Set(prev);
      if (next.has(s)) { next.delete(s); } else { next.add(s); }
      if (next.size === 0) return new Set(["critical", "warn", "safe"] as Severity[]);
      return next;
    });
  }

  function resetFilters() {
    setActiveSeverities(new Set(["critical", "warn", "safe"] as Severity[]));
    setActiveCategory(null);
  }

  async function handleMapPick(lat: number, lon: number) {
    setMapPickLoading(true);
    const place = await reverseGeocode(lat, lon);
    setMapPickLoading(false);
    const finalPlace: Place = place ?? { name: `${lat.toFixed(4)}, ${lon.toFixed(4)}`, context: "Selected location", lat, lon, country: "Unknown", city: null };
    setMapPickPlace(finalPlace);
    setReportFlowOpen(true);
  }

  function closeReportModal() {
    setReportFlowOpen(false);
    setMapPickPlace(null);
    setMapPickReset(n => n + 1);
  }

  function dismissWelcome() {
    sessionStorage.setItem(WELCOME_KEY, "1");
    setWelcomeOpen(false);
    setLoadingPhase("active");
    setLoadingMinPassed(false);
    setTimeout(() => setLoadingMinPassed(true), 2200);
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteNav onReport={() => setReportFlowOpen(true)} reportsCount={reports.length} status={status} />

      {/* Connecting banner — motivational ticker while API is warming up */}
      {waking && loadingPhase === "hidden" && <ConnectingBanner />}

      {/* ── HERO ────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-[1400px] px-4 pt-10 pb-8">
        <div className="grid gap-10 md:grid-cols-[1.1fr_0.9fr]">
          {/* Left */}
          <div className="float-in flex flex-col gap-6">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-white/70 px-3 py-1.5 text-xs font-semibold shadow-soft backdrop-blur">
              ✨ <span className="text-muted-foreground">{reports.length > 0 ? `${reports.length} live reports worldwide` : "Community powered disaster watch"}</span>
            </div>
            <h1 className="font-display text-4xl font-bold leading-[1.05] md:text-5xl xl:text-6xl text-foreground">
              What's happening{" "}
              <span className="bg-gradient-to-r from-primary via-sky-500 to-accent bg-clip-text text-transparent">
                near you, right now?
              </span>
            </h1>
            <p className="max-w-lg text-base text-muted-foreground md:text-lg leading-relaxed">
              See something on the road, in your area, or near home? Tell the world. Your report helps someone nearby make a better decision.
            </p>
            <div className="flex flex-wrap gap-3">
              <button onClick={() => setReportFlowOpen(true)}
                className="inline-flex items-center gap-2 rounded-full bg-foreground text-background px-5 py-3 text-sm font-semibold shadow-soft hover:opacity-90 transition-opacity">
                📷 Share what you see
              </button>
              <a href="#map" className="inline-flex items-center gap-2 rounded-full border border-border bg-white/70 backdrop-blur px-5 py-3 text-sm font-semibold text-foreground hover:bg-secondary transition-colors">
                🗺 Explore the live map
              </a>
            </div>
            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 max-w-md">
              {[
                { n: stats.active, label: "Active alerts" },
                { n: stats.critical, label: "Critical now" },
                { n: stats.today, label: "Today" },
              ].map(({ n, label }) => (
                <div key={label} className="rounded-2xl border border-border bg-white/70 p-3 backdrop-blur text-center">
                  <div className="font-display text-2xl font-bold text-foreground tabular-nums">{n}</div>
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mt-0.5">{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right — live card */}
          <div className="hidden md:block relative">
            <div aria-hidden className="absolute inset-0 rounded-3xl bg-gradient-to-br from-sky-200/60 via-white to-accent/40 blur-2xl" />
            <div className="relative rounded-3xl border border-border bg-white/70 p-4 shadow-float backdrop-blur">
              <div className="flex items-center gap-2 mb-4">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-[11px] font-bold text-success">
                  <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" /> LIVE FEED
                </span>
                <span className="text-[11px] text-muted-foreground">latest updates</span>
              </div>
              <div className="space-y-2">
                {status !== "live" ? (
                  <div className="space-y-2">
                    {[1,2,3].map(i => (
                      <div key={i} className="rounded-2xl border border-border bg-card/60 p-3 animate-pulse">
                        <div className="flex gap-2 mb-2"><div className="h-4 w-14 rounded-full bg-secondary" /><div className="h-4 w-10 rounded-full bg-secondary" /></div>
                        <div className="h-3 bg-secondary rounded w-full mb-1" />
                        <div className="h-3 bg-secondary rounded w-2/3" />
                      </div>
                    ))}
                  </div>
                ) : reports.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">No reports yet</div>
                ) : (
                  reports.slice(0, 3).map(r => (
                    <IncidentCard key={r.id} report={r} compact flash={flashId === r.id} onSelect={() => setDetailReport(r)} />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── MAP ─────────────────────────────────────────────── */}
      <section id="map" className="mx-auto w-full max-w-[1400px] px-4 pb-12">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold text-foreground">Live map</h2>
          <span className="text-sm text-muted-foreground">{filteredReports.filter(r => r.lat).length} incidents plotted</span>
        </div>
        <div className="relative h-[640px] w-full overflow-visible">
          {/* Left floating filter panel */}
          <div className="absolute bottom-4 left-4 z-[450] w-[min(280px,calc(100%-2rem))] md:bottom-auto md:top-20">
            <div className="rounded-2xl border border-border bg-white/95 p-4 shadow-float backdrop-blur pointer-events-auto">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-foreground flex items-center gap-1.5">🔽 Filters</span>
                <button onClick={resetFilters} className="text-[11px] font-medium text-primary hover:underline">Reset</button>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Severity</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(["critical","warn","safe"] as Severity[]).map(s => {
                      const sv = SEV[s];
                      return (
                        <button key={s} onClick={() => toggleSeverity(s)}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-all ${activeSeverities.has(s) ? sv.chip : "border-border text-muted-foreground bg-transparent"}`}>
                          <span className={`h-2 w-2 rounded-full ${sv.dot}`} />{sv.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {categories.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Category</p>
                    <div className="flex flex-wrap gap-1.5">
                      <button onClick={() => setActiveCategory(null)}
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-all ${!activeCategory ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground"}`}>
                        All
                      </button>
                      {categories.map(c => {
                        const cm = catMeta(c);
                        return (
                          <button key={c} onClick={() => setActiveCategory(activeCategory === c ? null : c)}
                            className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-all ${activeCategory === c ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground"}`}>
                            {cm.emoji} {c}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="rounded-xl bg-secondary/70 p-2.5 text-[11px] text-muted-foreground">
                  Showing {filteredReports.length} of {reports.length} reports
                </div>
              </div>
            </div>
          </div>

          {/* Right floating live updates panel */}
          <div className="absolute right-4 top-20 z-[450] hidden lg:flex w-[300px] flex-col max-h-[460px] rounded-2xl border border-border bg-white/95 shadow-float backdrop-blur overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2 shrink-0">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-bold text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" /> LIVE
              </span>
              <span className="text-xs font-semibold text-foreground">Updates</span>
              <span className="ml-auto text-[11px] text-muted-foreground">{filteredReports.length}</span>
            </div>
            <div className="overflow-y-auto no-scrollbar flex-1">
              {status !== "live" && filteredReports.length === 0 && (
                <div className="p-3 space-y-2">
                  {[1,2,3,4].map(i => (
                    <div key={i} className="flex gap-2 p-2 animate-pulse">
                      <div className="h-12 w-12 rounded-lg bg-secondary shrink-0" />
                      <div className="flex-1 space-y-1.5 pt-1">
                        <div className="h-2.5 bg-secondary rounded w-2/3" />
                        <div className="h-2.5 bg-secondary rounded w-full" />
                        <div className="h-2.5 bg-secondary rounded w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {filteredReports.slice(0, 20).map(r => (
                <button key={r.id} onClick={() => {
                  setDetailReport(r);
                  if (r.lat && r.lon) setFlyTo([r.lat, r.lon]);
                }} className={`w-full text-left p-3 border-b border-border/60 hover:bg-secondary/50 transition-colors ${flashId === r.id ? "bg-primary/5" : ""}`}>
                  <div className="flex items-start gap-2">
                    {r.image_url && <img src={r.image_url} alt="" className="h-14 w-14 rounded-lg object-cover shrink-0 border border-border" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${SEV[r.severity].dot}`} />
                        <span className="text-[10px] font-bold text-muted-foreground truncate">{r.district}</span>
                        <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{formatReportTime(r.created_at)}</span>
                      </div>
                      <p className="text-xs text-foreground line-clamp-2 leading-snug">{r.message}</p>
                    </div>
                  </div>
                </button>
              ))}
              {filteredReports.length === 0 && (
                <div className="p-6 text-center text-xs text-muted-foreground">No matching incidents</div>
              )}
            </div>
          </div>

          {mapPickLoading && (
            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-[500] flex items-center gap-2 rounded-full bg-card border border-border px-4 py-2 text-sm font-semibold shadow-float">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              Finding location…
            </div>
          )}

          <LiveMap
            reports={filteredReports}
            flyTo={flyTo}
            resetView={mapResetView}
            onMapPick={handleMapPick}
            onSelectReport={r => setDetailReport(r)}
            pickReset={mapPickReset}
          />
        </div>
        <p className="mt-3 text-center text-xs text-muted-foreground">Click anywhere on the map to report an incident</p>
      </section>

      {/* ── FEED GRID ────────────────────────────────────────── */}
      <section id="feed" className="mx-auto w-full max-w-[1400px] px-4 pb-12">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold text-foreground">Latest from the community</h2>
            <p className="mt-1 text-sm text-muted-foreground">Real-time crowdsourced reports from around the world</p>
          </div>
          <button onClick={refresh} className="text-xs font-medium text-primary hover:underline">↻ Refresh</button>
        </div>
        {status !== "live" ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="rounded-2xl border border-border bg-card overflow-hidden animate-pulse">
                <div className="h-36 bg-secondary" />
                <div className="p-4 space-y-2">
                  <div className="flex gap-2"><div className="h-5 w-16 rounded-full bg-secondary" /><div className="h-5 w-12 rounded-full bg-secondary" /></div>
                  <div className="h-4 bg-secondary rounded w-full" />
                  <div className="h-4 bg-secondary rounded w-3/4" />
                  <div className="h-3 bg-secondary rounded w-1/2 mt-1" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card py-16 text-center">
            <p className="text-4xl mb-3">🛡</p>
            <p className="font-semibold text-foreground">No reports yet</p>
            <p className="text-sm text-muted-foreground mt-1">Be the first to report an incident in your area</p>
            <button onClick={() => setReportFlowOpen(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-foreground text-background px-5 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity">
              📷 Report now
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredReports.slice(0, 6).map(r => (
              <IncidentCard key={r.id} report={r} flash={flashId === r.id} onSelect={() => setDetailReport(r)} />
            ))}
          </div>
        )}
        {filteredReports.length > 6 && (
          <div className="mt-6 text-center">
            <button className="rounded-full border border-border bg-white/70 backdrop-blur px-6 py-2.5 text-sm font-medium text-foreground hover:bg-secondary transition-colors">
              View all {filteredReports.length} reports
            </button>
          </div>
        )}
      </section>

      {/* ── ALERTS ───────────────────────────────────────────── */}
      <section id="alerts" className="mx-auto w-full max-w-[1400px] px-4 pb-12">
        <div className="mb-6">
          <h2 className="font-display text-2xl font-bold text-foreground">Official alerts</h2>
          <p className="mt-1 text-sm text-muted-foreground">Verified advisories from NDMA, IMD and district authorities</p>
        </div>
        {alertStatus === "loading" ? (
          <div className="grid gap-3 md:grid-cols-2">
            {[1,2,3,4].map(i => <div key={i} className="h-28 rounded-2xl bg-secondary animate-pulse" />)}
          </div>
        ) : alerts.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card py-12 text-center">
            <p className="text-3xl mb-2">✅</p>
            <p className="font-semibold text-foreground">No active official alerts</p>
            <p className="text-sm text-muted-foreground mt-1">All official advisory feeds are clear right now</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {alerts.map(a => <AlertCard key={a.id} alert={a} />)}
          </div>
        )}
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────── */}
      <section id="how" className="mx-auto w-full max-w-[1400px] px-4 pb-14">
        <div className="rounded-[28px] bg-gradient-to-br from-sky-100 via-white to-peach/60 p-6 md:p-10 border border-border">
          <div className="mb-8 text-center">
            <h2 className="font-display text-2xl font-bold text-foreground md:text-3xl">
              Built for small towns and the whole world.
            </h2>
            <p className="mt-2 text-muted-foreground max-w-lg mx-auto">Anyone, anywhere can report and verify incidents in real time — no account needed.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { icon: "📷", n: "1", title: "Spot it", desc: "See something? Tap the Report button, drop a pin, and describe what you see. Takes under 30 seconds." },
              { icon: "👥", n: "2", title: "Neighbors verify", desc: "Others nearby confirm or challenge your post. The more votes, the more reliable the signal." },
              { icon: "📢", n: "3", title: "The world sees it", desc: "Your report appears on the live map instantly. Emergency teams and travelers can act on it right away." },
            ].map(s => (
              <div key={s.n} className="rounded-2xl border border-white/70 bg-white/80 p-5 backdrop-blur">
                <div className="h-10 w-10 rounded-xl bg-foreground text-background grid place-items-center text-xl mb-4 shadow-soft">
                  {s.icon}
                </div>
                <h3 className="font-display text-base font-bold text-foreground">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-6 border-t border-border/60 pt-6">
            {[["🛡","Community verified"],["🌐","Works worldwide"],["💬","Free and open"]].map(([icon,text]) => (
              <span key={text} className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <span className="text-base">{icon}</span>{text}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────── */}
      <footer className="border-t border-border bg-white/60 py-8 backdrop-blur mt-auto">
        <div className="mx-auto flex w-full max-w-[1400px] flex-col items-center justify-between gap-2 px-4 text-sm text-muted-foreground sm:flex-row">
          <span>© 2026 DisasterWatch</span>
          <span>Made for neighbors, everywhere.</span>
        </div>
      </footer>

      {/* ── Modals ─────────────────────────────────────────── */}
      {welcomeOpen && (
        <WelcomeModal dataReady={status === "live" && alertStatus !== "loading"} t={t} onDismiss={dismissWelcome} />
      )}
      {reportFlowOpen && (
        <ReportFlowModal onClose={closeReportModal} onReported={refresh} initialPlace={mapPickPlace ?? undefined} />
      )}
      {districtFocus && (
        <DistrictModal
          district={districtFocus} reports={reports.filter(r => r.district === districtFocus)}
          alerts={alerts.filter(a => a.district === districtFocus)} onClose={() => setDistrictFocus(null)}
        />
      )}
      {detailReport && <StandaloneDetailModal report={detailReport} onClose={() => setDetailReport(null)} />}
      {loadingPhase !== "hidden" && <LoadingScreen fading={loadingPhase === "fading"} waking={waking} />}
    </div>
  );
}

/* ─── Report Flow Modal ──────────────────────────────────────── */
function ReportFlowModal({ onClose, onReported, initialPlace }: {
  onClose: () => void; onReported: () => void; initialPlace?: Place;
}) {
  const [step, setStep] = useState<"location" | "form">(initialPlace ? "form" : "location");
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(initialPlace ?? null);
  function handlePlaceSelected(p: Place) { setSelectedPlace(p); setStep("form"); }
  return (
    <div className="fixed inset-0 z-[9000] flex items-end sm:items-center justify-center bg-foreground/40 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="relative flex h-[min(580px,calc(100dvh-env(safe-area-inset-bottom)))] sm:h-[min(560px,calc(100dvh-2rem))] w-full sm:max-w-sm flex-col overflow-hidden rounded-t-[2rem] sm:rounded-[2rem] border border-border bg-card shadow-float">
        {step === "location"
          ? <LocationPickerStep onSelect={handlePlaceSelected} onClose={onClose} />
          : selectedPlace ? <ReportFormStep place={selectedPlace} onBack={() => setStep("location")} onClose={onClose} onReported={onReported} /> : null}
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
      async pos => {
        const place = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        setGeoLoading(false);
        if (!place) { setGeoError(t.geoCantResolve); return; }
        onSelect(place);
      },
      err => { setGeoLoading(false); setGeoError(err.message || t.geoPermDenied); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border/60 px-6 py-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-primary">{t.step1of2}</p>
            <h2 className="font-display mt-0.5 text-xl font-bold text-foreground">{t.whereAreYou}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{t.searchLocalityHint}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-muted-foreground hover:text-foreground">✕</button>
        </div>
      </div>
      <div className="no-scrollbar flex-1 overflow-y-auto px-6 py-5">
        <div className="space-y-3">
          <div className="relative">
            <input type="text" value={query} onFocus={() => setOpen(true)}
              onChange={e => { setQuery(e.target.value); setOpen(true); }}
              placeholder={t.searchPlaceholder}
              className="w-full rounded-2xl border border-border bg-background py-3 pl-4 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {open && query.trim().length >= 2 && (
              <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-2xl border border-border bg-card shadow-float">
                {loading && <div className="px-4 py-2 text-xs text-muted-foreground">{t.searchingPlaces}</div>}
                {!loading && results.length === 0 && <div className="px-4 py-2 text-xs text-muted-foreground">{t.noPlacesFound}</div>}
                {results.map((p, i) => (
                  <button key={`${p.lat}-${p.lon}-${i}`} type="button" onClick={() => { onSelect(p); setOpen(false); }}
                    className="w-full border-b border-border/50 px-4 py-3 text-left transition last:border-0 hover:bg-secondary">
                    <div className="text-sm font-bold text-foreground">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.context}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" onClick={detectLocation} disabled={geoLoading}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-primary/30 bg-primary/10 py-3 text-sm font-bold text-primary transition hover:bg-primary/20 disabled:opacity-50">
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

  function pickImage(f: File | null) { setImageFile(f); setImagePreview(f ? URL.createObjectURL(f) : null); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = message.trim();
    if (!category) { setError(t.errSelectCategory); return; }
    if (!trimmed) { setError(t.errDescribeHappened); return; }
    if (imageFile && imageFile.size > 5 * 1024 * 1024) { setError(t.errImageSize); return; }
    setSubmitting(true); setError(null);
    try {
      const res = await fetch(`${API_BASE}/reports`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reporter_name: "Anonymous", content: trimmed, severity, category, latitude: place.lat, longitude: place.lon, locality: place.name, country: place.country, state: null }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); setError((err as { detail?: string }).detail || t.errSubmissionFailed); setSubmitting(false); return; }
      const created = await res.json() as { id: number };
      if (imageFile) {
        const fd = new FormData(); fd.append("file", imageFile);
        await fetch(`${API_BASE}/reports/${created.id}/images`, { method: "POST", body: fd });
      }
      onClose(); onReported();
    } catch { setError(t.errNetworkError); setSubmitting(false); }
  }

  return (
    <form onSubmit={submit} className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border/60 px-6 py-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-primary">{t.step2of2}</p>
            <h2 className="font-display mt-0.5 text-xl font-bold text-foreground">{place.name}</h2>
            <p className="text-xs text-muted-foreground">{place.context}</p>
          </div>
          <button type="button" onClick={onBack} className="text-xs font-bold text-primary hover:underline">← {t.backToList}</button>
        </div>
      </div>
      <div className="no-scrollbar flex-1 space-y-4 overflow-y-auto px-6 py-5">
        <div className="no-scrollbar -mx-6 flex gap-2 overflow-x-auto px-6 pb-1">
          {Object.entries(CATEGORY_META).map(([k, v]) => (
            <button key={k} type="button" onClick={() => setCategory(k)}
              className={`shrink-0 flex flex-col items-center gap-1 rounded-2xl border px-3 py-2 transition ${category === k ? "border-primary/60 bg-primary/15 text-foreground" : "border-border bg-secondary text-muted-foreground"}`}>
              <span className="text-lg leading-none">{v.emoji}</span>
              <span className="text-[9px] font-bold uppercase tracking-wider">{t[v.labelKey as keyof typeof t] as string}</span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(["safe","warn","critical"] as Severity[]).map(s => {
            const sv = SEV[s];
            return (
              <button key={s} type="button" onClick={() => setSeverity(s)}
                className={`rounded-2xl border py-2.5 text-xs font-bold uppercase tracking-widest transition ${severity === s ? sv.chip : "border-border text-muted-foreground hover:border-foreground/30"}`}>
                {sv.label}
              </button>
            );
          })}
        </div>
        <div>
          <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4} maxLength={500} placeholder={t.describePlaceholder}
            className="w-full resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <div className="mt-1 flex justify-between text-xs text-muted-foreground">
            <span className={error ? "font-semibold text-destructive" : ""}>{error ?? t.visiblePublicly}</span>
            <span>{message.length}/500</span>
          </div>
        </div>
        {imagePreview ? (
          <div className="relative">
            <img src={imagePreview} alt="" className="w-full max-h-40 rounded-2xl border border-border object-cover" />
            <button type="button" onClick={() => pickImage(null)} className="absolute right-2 top-2 rounded-full border border-border bg-card px-2 py-1 text-[10px] font-bold">{t.removePhoto}</button>
          </div>
        ) : (
          <label className="flex cursor-pointer items-center justify-center rounded-2xl border border-dashed border-primary/40 py-5 transition hover:bg-primary/5">
            <input type="file" accept="image/*" className="hidden" onChange={e => pickImage(e.target.files?.[0] ?? null)} />
            <span className="text-xs font-semibold text-muted-foreground">{t.attachPhotoBtn}</span>
          </label>
        )}
      </div>
      <div className="shrink-0 border-t border-border/60 px-6 py-4">
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 rounded-2xl border border-border py-3 text-sm font-semibold text-foreground transition hover:bg-secondary">{t.cancel}</button>
          <button type="submit" disabled={submitting} className="flex-1 rounded-2xl bg-foreground py-3 text-sm font-bold text-background transition hover:opacity-90 disabled:opacity-50">
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
      <div onClick={e => e.stopPropagation()}
        className="relative flex max-h-[min(640px,calc(100dvh-2rem))] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] border border-border bg-card shadow-float">
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
  const sev = SEV[report.severity];
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
    setLocalCounts(c => c ? { ...c, [kind === "confirm" ? "confirmed" : kind]: c[kind === "confirm" ? "confirmed" : kind as "incorrect"|"resolved"] + 1 } : c);
    await fetch(`${API_BASE}/reports/${report.id}/verifications`, {
      method: "POST", headers: { "Content-Type": "application/json" },
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
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author_name: anonName.current, content: text }),
      });
      if (res.ok) { setComments(prev => [...prev, { id: Date.now(), author_name: anonName.current, content: text, created_at: new Date().toISOString() }]); setCommentText(""); }
    } finally { setPosting(false); }
  }

  const imgUrl = data?.images?.[0]?.file_path ? `${UPLOADS_ORIGIN}/uploads/${data.images[0].file_path}` : report.image_url;
  const [imgExpanded, setImgExpanded] = useState(false);

  return (
    <>
      {imgExpanded && imgUrl && (
        <div className="fixed inset-0 z-[9500] flex items-center justify-center bg-black/90 p-4" onClick={() => setImgExpanded(false)}>
          <img src={imgUrl} alt="" className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl" />
          <button onClick={() => setImgExpanded(false)} className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-white/20 text-white hover:bg-white/30">✕</button>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Severity bar */}
        <div className={`h-1.5 w-full shrink-0 ${sev.bar}`} />
        <div className="shrink-0 px-6 py-4 border-b border-border/60">
          <div className="flex items-center justify-between">
            <button onClick={onBack} className="text-xs font-bold text-primary hover:underline">← Back</button>
            <div className="flex items-center gap-2">
              <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${sev.chip}`}>{sev.label}</span>
              <span className="rounded-lg bg-secondary px-2.5 py-1 text-[10px] font-bold text-foreground">{cat.emoji} {t[cat.labelKey as keyof typeof t] as string}</span>
            </div>
          </div>
          <h2 className="font-display mt-3 text-lg font-bold text-foreground">
            Incident in {report.district}{report.place ? ` · ${report.place}` : ""}
          </h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{formatReportTime(report.created_at)}</p>
        </div>
        <div className="no-scrollbar flex-1 overflow-y-auto">
          {imgUrl && (
            <button onClick={() => setImgExpanded(true)} className="group block w-full shrink-0 overflow-hidden border-b border-border/60">
              <img src={imgUrl} alt="" className="w-full max-h-52 object-cover transition group-hover:brightness-90" />
            </button>
          )}
          <div className="px-6 py-4">
            <p className="text-sm leading-relaxed text-foreground">{report.message}</p>
          </div>
          {/* Stats grid */}
          {loading ? (
            <div className="px-6 py-4 text-xs text-muted-foreground animate-pulse">Loading details…</div>
          ) : localCounts && (
            <div className="px-6 pb-4">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t.communityVotesLabel}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {([
                  { kind: "confirm" as const, label: t.confirm, count: localCounts.confirmed, cls: "text-success", icon: "👍" },
                  { kind: "incorrect" as const, label: t.incorrect, count: localCounts.incorrect, cls: "text-destructive", icon: "👎" },
                  { kind: "resolved" as const, label: t.resolved, count: localCounts.resolved, cls: "text-primary", icon: "✓" },
                  { kind: null, label: "Views", count: data?.views_count ?? 0, cls: "text-muted-foreground", icon: "👁" },
                ]).map(({ kind, label, count, cls, icon }) => (
                  <div key={label}
                    className={`rounded-xl border border-border bg-secondary/50 px-3 py-2 text-center ${kind && !voted ? "cursor-pointer hover:bg-secondary" : ""}`}
                    onClick={() => kind && !voted && vote(kind)}>
                    <div className={`text-xs font-bold uppercase tracking-wide ${cls} flex items-center justify-center gap-1 mb-1`}>
                      <span>{icon}</span><span className="font-mono-sm">{label}</span>
                    </div>
                    <div className="font-mono text-lg font-bold tabular-nums text-foreground">{count}</div>
                    {kind === voted && <div className="text-[10px] text-success mt-0.5">✓ voted</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Comments */}
          <div className="px-6 py-4">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t.discussionHd.replace("💬 ", "")}</p>
            {comments.length === 0
              ? <p className="text-xs italic text-muted-foreground/60">{t.noCommentsYet}</p>
              : <div className="space-y-2">
                  {comments.map(c => (
                    <div key={c.id} className="rounded-xl border border-border bg-secondary px-4 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-primary">{c.author_name} · {formatReportTime(c.created_at)}</p>
                      <p className="mt-1 text-xs leading-snug text-foreground">{c.content}</p>
                    </div>
                  ))}
                </div>
            }
          </div>
        </div>
        <div className="shrink-0 border-t border-border bg-card px-4 py-3">
          <form onSubmit={submitComment} className="flex items-end gap-2">
            <textarea value={commentText} onChange={e => setCommentText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (commentText.trim()) submitComment(e as unknown as React.FormEvent); }}}
              rows={2} placeholder={t.commentPlaceholder}
              className="no-scrollbar flex-1 resize-none rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
            />
            <button type="submit" disabled={posting}
              className="mb-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-foreground text-background transition hover:opacity-90 disabled:opacity-40">
              {posting ? <span className="text-xs">…</span> : <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" /></svg>}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

/* ─── District Modal ────────────────────────────────────────── */
function DistrictModal({ district, reports, alerts, onClose }: {
  district: string; reports: Report[]; alerts: OfficialAlert[]; onClose: () => void;
}) {
  const { t } = useLanguage();
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const sev = reports.length > 0 ? reports.reduce((best, r) => ({ critical: 2, warn: 1, safe: 0 }[r.severity] > { critical: 2, warn: 1, safe: 0 }[best] ? r.severity : best), "safe" as Severity) : "safe";

  return (
    <div className="fixed inset-0 z-[9000] flex items-end justify-center bg-foreground/30 backdrop-blur-sm p-3 sm:items-center sm:p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-[2rem] border border-border bg-card shadow-float"
        style={{ maxHeight: "88vh" }}>
        <div className={`h-1.5 w-full shrink-0 ${SEV[sev].bar}`} />
        <div className="shrink-0 border-b border-border px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-primary">{t.dossierLabel}</p>
              <h2 className="font-display text-2xl font-bold text-foreground mt-0.5">{district}</h2>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <div className="text-right">
                <div className={`font-display text-xl font-bold ${SEV[sev].text}`}>{alerts.length}</div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{t.officialLabel}</div>
              </div>
              <div className="text-right">
                <div className="font-display text-xl font-bold text-primary">{reports.length}</div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{t.crowdLabel}</div>
              </div>
              <button onClick={onClose} className="text-xs font-bold text-muted-foreground hover:text-foreground">✕</button>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-border">
          {alerts.length > 0 && (
            <section className="px-5 py-4">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t.officialAdvisories}</p>
              <div className="space-y-2">
                {alerts.map(a => <AlertCard key={a.id} alert={a} />)}
              </div>
            </section>
          )}
          <section className="px-5 py-4">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t.crowdBriefs} ({reports.length})</p>
            <div className="space-y-2">
              {reports.length === 0
                ? <p className="py-6 text-center text-xs italic text-muted-foreground">{t.noCrowdReportsYet}</p>
                : reports.map(r => (
                    <button key={r.id} onClick={() => setSelectedReport(r)}
                      className="flex w-full items-start gap-3 rounded-2xl border border-border bg-background p-3 text-left transition hover:bg-secondary">
                      <span className="mt-0.5 shrink-0 text-lg">{catMeta(r.category).emoji}</span>
                      <div className="min-w-0 flex-1">
                        <div className={`text-[11px] font-bold ${SEV[r.severity].text}`}>{SEV[r.severity].label} · {r.place ?? r.district} · {formatReportTime(r.created_at)}</div>
                        <p className="mt-0.5 text-sm text-foreground leading-snug line-clamp-2">{r.message}</p>
                      </div>
                    </button>
                  ))
              }
            </div>
          </section>
        </div>
        {selectedReport && (
          <div className="absolute inset-0 z-10 overflow-hidden rounded-[2rem] border-t-2 border-primary bg-card">
            <ReportDetailPanel report={selectedReport} onBack={() => setSelectedReport(null)} />
          </div>
        )}
      </div>
    </div>
  );
}
