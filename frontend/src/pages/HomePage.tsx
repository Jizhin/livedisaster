import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { useLanguage } from "../i18n/LanguageContext";
import {
  Camera, Search, MessageCircle, ArrowRight, Filter, X,
  ThumbsUp, CheckCircle2, MessageSquare, ShieldAlert, MapPin,
} from "lucide-react";

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

type TickerEvent = {
  id: string; emoji: string; title: string;
  location: string | null; alert: "green" | "orange" | "red" | "info";
  source: "GDACS" | "NASA"; url: string | null;
};
type GDACSFeature = {
  properties: {
    name?: string; eventtype: string; alertlevel?: string;
    country?: string; url?: { report?: string };
  };
};
type EONETEvent = {
  id: string; title: string;
  categories: { id: string; title: string }[];
  sources: { id: string; url: string }[];
  closed: string | null;
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

const GDACS_META: Record<string, string> = {
  EQ: "🌍", TC: "🌀", FL: "🌊", VO: "🌋", DR: "🏜", WF: "🔥",
};
const EONET_META: Record<string, string> = {
  drought: "🏜", dustHaze: "🌫", earthquakes: "🌍", floods: "🌊",
  landslides: "⛰️", seaLakeIce: "🧊", severeStorms: "🌪", snow: "❄️",
  tempExtremes: "🌡️", volcanoes: "🌋", waterColor: "💧", wildfires: "🔥",
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
  streets:   { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}", sub: null, maxZ: 19, attr: "Tiles © Esri © OpenStreetMap contributors", label: "Map", icon: "🗺", labels: null },
  terrain:   { url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",                        sub: "abc",  maxZ: 17, attr: "© OpenStreetMap, SRTM | OpenTopoMap (CC-BY-SA)", label: "Terrain",   icon: "⛰", labels: null },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    sub: null, maxZ: 18, attr: "Tiles © Esri © OpenStreetMap contributors", label: "Satellite", icon: "🛰",
    labels: null,
  },
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

function useGDACS(): TickerEvent[] {
  const [events, setEvents] = useState<TickerEvent[]>([]);
  useEffect(() => {
    const ctrl = new AbortController();
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().split("T")[0];
    fetch(
      `https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=EQ,TC,FL,VO,DR,WF&alertlevel=Green,Orange,Red&fromDate=${fmt(from)}&toDate=${fmt(to)}`,
      { signal: ctrl.signal }
    )
      .then(r => r.json())
      .then((d: { features: GDACSFeature[] }) => {
        setEvents(
          (d.features ?? []).slice(0, 15).map((f, i) => {
            const p = f.properties;
            const alert: TickerEvent["alert"] =
              p.alertlevel?.toLowerCase() === "red" ? "red" :
              p.alertlevel?.toLowerCase() === "orange" ? "orange" : "green";
            return {
              id: `gdacs-${i}`, emoji: GDACS_META[p.eventtype] ?? "⚠️",
              title: p.name ?? p.eventtype, location: p.country ?? null,
              alert, source: "GDACS", url: p.url?.report ?? null,
            };
          })
        );
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, []);
  return events;
}

function useNASAEONET(): TickerEvent[] {
  const [events, setEvents] = useState<TickerEvent[]>([]);
  useEffect(() => {
    const ctrl = new AbortController();
    fetch("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=15", { signal: ctrl.signal })
      .then(r => r.json())
      .then((d: { events: EONETEvent[] }) => {
        setEvents(
          (d.events ?? []).slice(0, 15).map(e => ({
            id: e.id, emoji: EONET_META[e.categories?.[0]?.id ?? ""] ?? "🌐",
            title: e.title, location: null, alert: "info" as const,
            source: "NASA", url: e.sources?.[0]?.url ?? null,
          }))
        );
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, []);
  return events;
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

/* ─── Live Event Ticker ─────────────────────────────────────── */
function LiveTicker() {
  const gdacs = useGDACS();
  const nasa = useNASAEONET();
  const [paused, setPaused] = useState(false);

  const all = [...gdacs, ...nasa];
  if (all.length === 0) return null;

  const items = [...all, ...all];
  const dur = Math.max(80, all.length * 8);

  return (
    <div className="w-full overflow-hidden border-y border-border/60 bg-white/60 backdrop-blur-sm">
      <div className="flex items-stretch h-10"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}>
        {/* Fixed "LIVE" label */}
        <div className="shrink-0 flex items-center gap-1.5 border-r border-border bg-foreground px-4">
          <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-background whitespace-nowrap">Live</span>
        </div>

        {/* Scrolling strip */}
        <div className="relative flex-1 overflow-hidden">
          <div className="pointer-events-none absolute left-0 inset-y-0 w-12 z-10"
            style={{ background: "linear-gradient(to right, rgba(255,255,255,0.7), transparent)" }} />
          <div className="pointer-events-none absolute right-0 inset-y-0 w-12 z-10"
            style={{ background: "linear-gradient(to left, rgba(255,255,255,0.7), transparent)" }} />

          <div className="flex items-center h-full"
            style={{ animation: `lk-ticker ${dur}s linear infinite`, animationPlayState: paused ? "paused" : "running", width: "max-content" }}>
            {items.map((ev, i) => (
              <div key={`${ev.id}-${i}`}
                className="flex shrink-0 items-center gap-2 px-5 h-full border-r border-border/20">
                <span className="text-sm leading-none">{ev.emoji}</span>
                <span className="text-[11px] font-semibold text-foreground whitespace-nowrap" title={ev.title}>
                  {ev.title.length > 55 ? ev.title.slice(0, 55) + "…" : ev.title}
                </span>
                {ev.location && (
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">· {ev.location}</span>
                )}
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                  ev.source === "NASA" ? "bg-blue-50 text-blue-700" :
                  ev.alert === "red"   ? "bg-red-50 text-red-700" :
                  ev.alert === "orange"? "bg-amber-50 text-amber-700" :
                                         "bg-emerald-50 text-emerald-700"
                }`}>{ev.source}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <style>{`@keyframes lk-ticker { from { transform: translateX(0) } to { transform: translateX(-50%) } }`}</style>
    </div>
  );
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
            <div className="font-display font-bold text-base tracking-tight text-foreground">LiveKerala</div>
            <div className="hidden sm:block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Crowdsourced disaster watch</div>
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
  const [imgErr, setImgErr] = useState(false);

  if (compact) {
    return (
      <article onClick={onSelect}
        className={`cursor-pointer overflow-hidden rounded-xl border border-border bg-card p-3 hover:bg-secondary/50 transition-colors ${flash ? "ring-2 ring-primary/30" : ""}`}>
        <div className="flex items-start gap-2">
          <div className={`h-8 w-8 rounded-lg grid place-items-center shrink-0 text-lg ${sev.chip}`}>{cat.emoji}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className={`text-[10px] font-bold uppercase tracking-wider ${sev.text}`}>{sev.label}</span>
              <span className="ml-auto text-[10px] text-muted-foreground shrink-0">{formatReportTime(report.created_at)}</span>
            </div>
            <p className="mt-0.5 text-xs text-foreground line-clamp-2 leading-snug">{report.message}</p>
            <p className="mt-1 text-[10px] text-muted-foreground truncate">📍 {report.place ? `${report.place} · ${report.district}` : report.district}</p>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article onClick={onSelect}
      className={`group cursor-pointer overflow-hidden rounded-xl border border-border bg-card transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-float flex flex-col h-full ${flash ? "ring-2 ring-primary/30" : ""}`}>

      {/* Image area */}
      <div className="relative h-20 w-full overflow-hidden shrink-0">
        {report.image_url && !imgErr ? (
          <img src={report.image_url} alt="" onError={() => setImgErr(true)}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className={`h-full w-full flex items-center justify-center text-2xl select-none ${sev.chip}`}>
            {cat.emoji}
          </div>
        )}
        <div className="absolute left-2 top-2">
          <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold bg-white/95 backdrop-blur ${sev.chip}`}>
            <span className={`inline-block h-1.5 w-1.5 rounded-full mr-0.5 ${sev.dot}`} />{sev.label}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-col flex-1 p-2.5">
        <div className="flex items-center gap-1">
          <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[9px] text-muted-foreground truncate">
            {cat.emoji} {t[cat.labelKey as keyof typeof t] as string}
          </span>
          <span className="ml-auto text-[9px] text-muted-foreground shrink-0">{formatReportTime(report.created_at)}</span>
        </div>
        <p className="mt-1 text-xs leading-snug text-foreground line-clamp-2 flex-1">{report.message}</p>
        <div className="mt-1.5 flex items-center gap-1 text-muted-foreground">
          <MapPin className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate text-[9px]">{report.place ? `${report.place} · ${report.district}` : report.district}</span>
        </div>
        <div className="mt-1.5 flex items-center justify-between border-t border-border/60 pt-1.5">
          <div className="flex items-center gap-1 min-w-0">
            <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${report.id}`} alt=""
              className="h-5 w-5 shrink-0 rounded-full border border-border bg-secondary object-cover" />
            <div className="truncate text-[9px] font-semibold text-foreground">Community member</div>
          </div>
          <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
            <span className="inline-flex items-center gap-0.5"><ThumbsUp className="h-2 w-2 text-emerald-500" />0</span>
            <span className="inline-flex items-center gap-0.5"><MessageSquare className="h-2 w-2" />0</span>
          </div>
        </div>
      </div>
    </article>
  );
}

/* ─── All Reports Modal ──────────────────────────────────────── */
function AllReportsModal({ reports, onClose, onSelect }: { reports: Report[]; onClose: () => void; onSelect: (r: Report) => void }) {
  return (
    <div className="fixed inset-0 z-[8500] flex items-center justify-center bg-foreground/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="relative flex w-full max-w-3xl max-h-[82dvh] flex-col overflow-hidden rounded-[2rem] border border-border bg-card shadow-float float-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border/60 px-6 py-4 shrink-0">
          <h2 className="font-display text-lg font-bold text-foreground">All reports <span className="text-muted-foreground font-normal text-base">({reports.length})</span></h2>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-muted-foreground hover:bg-border transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-4">
          <div className="grid gap-2.5 sm:grid-cols-2">
            {reports.map(r => (
              <IncidentCard key={r.id} report={r} compact onSelect={() => { onSelect(r); onClose(); }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── GDACS Alert Card ───────────────────────────────────────── */
function GDACSAlertCard({ event }: { event: TickerEvent }) {
  const sevMap: Record<string, typeof SEV[keyof typeof SEV]> = { red: SEV.critical, orange: SEV.warn, green: SEV.safe, info: SEV.safe };
  const sev = sevMap[event.alert] ?? SEV.warn;
  return (
    <article className="relative overflow-hidden rounded-2xl border border-border bg-card p-4 hover:shadow-soft transition-shadow">
      <div className={`absolute inset-y-0 left-0 w-1.5 rounded-l-2xl ${sev.bar}`} />
      <div className="pl-3 flex items-start gap-3">
        <div className={`h-9 w-9 rounded-xl grid place-items-center shrink-0 text-xl ${sev.chip}`}>{event.emoji}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-2">{event.title}</h3>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 whitespace-nowrap ${sev.chip}`}>GDACS</span>
          </div>
          {event.location && (
            <div className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <span>📍</span><span className="truncate">{event.location}</span>
            </div>
          )}
          {event.url && (
            <a href={event.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
              className="mt-2 inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
              View details →
            </a>
          )}
        </div>
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
          <ShieldAlert className="h-4 w-4" />
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

/* ─── Marker Bubble ─────────────────────────────────────────── */
function MarkerBubble({ report, t, onClose }: { report: Report; t: ReturnType<typeof useLanguage>["t"]; onClose: () => void }) {
  const { data, loading } = useReportDetail(report.id);
  const [localCounts, setLocalCounts] = useState<{ confirmed: number; incorrect: number; resolved: number } | null>(null);
  const [voted, setVoted] = useState<string | null>(null);
  const [comments, setComments] = useState<ApiComment[]>([]);
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [posting, setPosting] = useState(false);
  const [imgExpanded, setImgExpanded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const anonName = useRef(`user_${Math.random().toString(36).slice(2, 8)}`);
  const sev = SEV[report.severity];
  const cat = catMeta(report.category);
  const imgUrl = data?.images?.[0]?.file_path ? `${UPLOADS_ORIGIN}/uploads/${data.images[0].file_path}` : report.image_url;

  useEffect(() => {
    if (data) {
      setLocalCounts({ confirmed: data.confirmed_count ?? 0, incorrect: data.incorrect_count ?? 0, resolved: data.resolved_count ?? 0 });
      setComments(data.comments ?? []);
    }
  }, [data]);

  async function vote(kind: "confirm" | "incorrect" | "resolved") {
    if (voted) return;
    setVoted(kind);
    setLocalCounts(c => {
      if (!c) return c;
      if (kind === "confirm") return { ...c, confirmed: c.confirmed + 1 };
      if (kind === "incorrect") return { ...c, incorrect: c.incorrect + 1 };
      return { ...c, resolved: c.resolved + 1 };
    });
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
      if (res.ok) {
        setComments(prev => [...prev, { id: Date.now(), author_name: anonName.current, content: text, created_at: new Date().toISOString() }]);
        setCommentText("");
      }
    } finally { setPosting(false); }
  }

  return (
    <>
      {/* Full-screen image — portal to body to escape Leaflet pane transforms */}
      {imgExpanded && imgUrl && createPortal(
        <div className="fixed inset-0 z-[9500] flex items-center justify-center bg-black/90 p-4" onClick={() => setImgExpanded(false)}>
          <img src={imgUrl} alt="" className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl" />
          <button onClick={() => setImgExpanded(false)} className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-white/20 text-white hover:bg-white/30">✕</button>
        </div>,
        document.body
      )}

      {/* Card — Leaflet positions this via its popup mechanism */}
      <div className="overflow-hidden rounded-2xl bg-card float-in" style={{ width: 300 }}>
        {/* Severity bar */}
        <div className={`h-1 w-full ${sev.bar}`} />

        {/* Image strip */}
        {imgUrl && !imgError && (
          <button onClick={() => setImgExpanded(true)} className="block w-full overflow-hidden h-24 bg-secondary">
            <img src={imgUrl} alt="" onError={() => setImgError(true)} className="w-full h-full object-cover hover:brightness-90 transition" />
          </button>
        )}

        {/* Header */}
        <div className="flex items-start gap-2 px-3 pt-3 pb-1">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 flex-wrap">
              <span className={`text-[10px] font-bold uppercase tracking-wider ${sev.text}`}>{sev.label}</span>
              <span className="text-muted-foreground/40 text-[10px]">·</span>
              <span className="text-[10px] text-muted-foreground">{cat.emoji} {t[cat.labelKey as keyof typeof t] as string}</span>
              <span className="text-muted-foreground/40 text-[10px]">·</span>
              <span className="text-[10px] text-muted-foreground">{formatReportTime(report.created_at)}</span>
            </div>
            <p className="font-display text-sm font-bold text-foreground mt-0.5 leading-snug">
              {report.place ? `${report.place} · ${report.district}` : report.district}
            </p>
          </div>
          <button onClick={onClose}
            className="shrink-0 grid h-6 w-6 place-items-center rounded-full bg-secondary text-muted-foreground hover:bg-border transition-colors">
            <X className="h-3 w-3" />
          </button>
        </div>

        {/* Message */}
        <div className="px-3 pt-0.5 pb-3 border-b border-border/60">
          <p className="text-[13px] leading-relaxed text-foreground">{report.message}</p>
        </div>

        {/* Vote row */}
        <div className="flex border-b border-border/60">
          {loading ? (
            <div className="flex-1 h-9 animate-pulse bg-secondary/50" />
          ) : localCounts ? (
            (([
              { kind: "confirm" as const, icon: "👍", count: localCounts.confirmed, active: "bg-emerald-50 text-emerald-700" },
              { kind: "incorrect" as const, icon: "👎", count: localCounts.incorrect, active: "bg-red-50 text-red-700" },
              { kind: "resolved" as const, icon: "✓", count: localCounts.resolved, active: "bg-blue-50 text-blue-700" },
              { kind: null, icon: "👁", count: data?.views_count ?? 0, active: "" },
            ] as Array<{ kind: "confirm" | "incorrect" | "resolved" | null; icon: string; count: number; active: string }>)).map(({ kind, icon, count, active }) => (
              <button key={String(kind)} onClick={() => kind && vote(kind)} disabled={!kind || !!voted}
                className={`flex-1 flex flex-col items-center justify-center py-1.5 gap-0.5 text-[10px] font-bold border-r border-border/40 last:border-r-0 transition-colors disabled:cursor-default ${voted === kind ? active : !kind ? "text-muted-foreground/50" : "text-muted-foreground hover:bg-secondary"}`}>
                <span className="text-sm leading-none">{icon}</span>
                <span>{count}</span>
              </button>
            ))
          ) : null}
        </div>

        {/* Comment input */}
        <div className="px-3 py-2">
          <form onSubmit={submitComment} className="flex items-center gap-2">
            <input value={commentText} onChange={e => setCommentText(e.target.value)}
              placeholder="Add a note…"
              className="flex-1 min-w-0 rounded-full border border-border bg-secondary px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/25"
            />
            <button type="submit" disabled={posting || !commentText.trim()}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-foreground text-background hover:opacity-90 disabled:opacity-30 transition-opacity">
              {posting ? <span className="text-[10px]">…</span> : <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" /></svg>}
            </button>
          </form>
          {comments.length > 0 && (
            <button onClick={() => setShowComments(v => !v)} className="mt-1 text-[10px] font-medium text-primary hover:underline">
              {showComments ? "Hide" : `${comments.length} comment${comments.length !== 1 ? "s" : ""}`}
            </button>
          )}
          {showComments && (
            <div className="mt-1.5 space-y-1 max-h-24 overflow-y-auto">
              {comments.map(c => (
                <div key={c.id} className="rounded-lg bg-secondary px-2.5 py-1.5">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-primary">{c.author_name}</p>
                  <p className="text-[11px] leading-snug text-foreground mt-0.5">{c.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ─── Live Map ──────────────────────────────────────────────── */
function LiveMap({ reports, flyTo, resetView, onMapPick, onSelectReport, pickReset, pickedLabel, activeLayer, onLayerChange }: {
  reports: Report[];
  flyTo?: [number, number] | null;
  resetView?: number;
  onMapPick?: (lat: number, lon: number) => void;
  onSelectReport: (r: Report) => void;
  pickReset?: number;
  pickedLabel?: string | null;
  activeLayer: TileKey;
  onLayerChange: (k: TileKey) => void;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
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

  const labelsRef = useRef<any[]>([]);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const [searchQ, setSearchQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const { t } = useLanguage();
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; }, [t]);
  const { results: searchResults, loading: searchLoading } = usePhotonSearch(searchQ);

  // Map init
  useEffect(() => {
    const L = (window as any).L;
    if (!containerRef.current || mapRef.current || !L) return;

    const map = L.map(containerRef.current, {
      center: [15, 30], zoom: 3,
      attributionControl: false, zoomControl: false,
      scrollWheelZoom: false, worldCopyJump: true,
    });

    // Dedicated pane for labels — always above base tiles, transparent to pointer events
    map.createPane("labelsPane");
    map.getPane("labelsPane").style.zIndex = "450";
    map.getPane("labelsPane").style.pointerEvents = "none";

    L.control.attribution({ prefix: false, position: "bottomright" }).addTo(map);

    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    map.on("click", (e: any) => {
      if (!onMapPickRef.current) return;
      const { lat, lng } = e.latlng;
      if (pendingPinRef.current) { pendingPinRef.current.remove(); pendingPinRef.current = null; }
      const L2 = (window as any).L;
      pendingPinRef.current = L2.marker([lat, lng], {
        icon: L2.divIcon({
          className: "",
          html: `<div style="display:flex;flex-direction:column;align-items:center;pointer-events:none;transform:translateX(-50%)"><div style="background:#1e293b;color:#fff;border-radius:20px;padding:5px 12px;font:700 12px/1.5 'Manrope',sans-serif;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,0.25)">📍 Report here</div><div style="width:2px;height:8px;background:#1e293b"></div><div style="width:8px;height:8px;background:#1e293b;border-radius:50%"></div></div>`,
          iconSize: [0, 0], iconAnchor: [0, 0],
        }),
        interactive: false,
        zIndexOffset: 1000,
      }).addTo(map);
      onMapPickRef.current(lat, lng);
    });

    return () => {
      map.remove();
      mapRef.current = null; layerRef.current = null; tileRef.current = null; labelsRef.current = [];
      fitDoneRef.current = false; pendingPinRef.current = null;
    };
  }, []);

  // Tile layer switch (also runs on initial render to set up the first tile)
  useEffect(() => {
    const L = (window as any).L;
    if (!mapRef.current || !L) return;
    if (tileRef.current) { tileRef.current.remove(); tileRef.current = null; }
    labelsRef.current.forEach(l => { try { l.remove(); } catch {} });
    labelsRef.current = [];
    const cfg = TILE_LAYERS[activeLayer];
    tileRef.current = L.tileLayer(cfg.url, {
      subdomains: cfg.sub ?? [], maxZoom: cfg.maxZ, attribution: cfg.attr,
      detectRetina: true,
    }).addTo(mapRef.current);
    // Satellite hybrid: OSM semi-transparent (roads+places) + Esri roads + Esri places + CartoDB labels
    if (activeLayer === "satellite") {
      const hybridLayers: { url: string; sub: string | null; opacity: number }[] = [
        { url: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}", sub: null, opacity: 1 },
        { url: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", sub: null, opacity: 1 },
      ];
      hybridLayers.forEach(({ url, sub, opacity }) => {
        labelsRef.current.push(
          L.tileLayer(url, { pane: "labelsPane", maxZoom: 19, opacity, ...(sub ? { subdomains: sub } : {}) }).addTo(mapRef.current)
        );
      });
    } else if (cfg.labels) {
      labelsRef.current.push(
        L.tileLayer(cfg.labels, { pane: "labelsPane", subdomains: "abcd", maxZoom: 19, opacity: 1 }).addTo(mapRef.current)
      );
    }
  }, [activeLayer]);

  // Markers
  useEffect(() => {
    const L = (window as any).L;
    if (!L || !mapRef.current || !layerRef.current) return;
    layerRef.current.clearLayers();

    const popupRoots: ReturnType<typeof createRoot>[] = [];

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
        iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -38],
      });

      const marker = L.marker([r.lat, r.lon], { icon });

      // Create popup container and React root once per marker
      const container = document.createElement("div");
      const root = createRoot(container);
      popupRoots.push(root);

      const leafletPopup = L.popup({
        closeButton: false,
        className: "lk-popup",
        minWidth: 300,
        maxWidth: 300,
        autoPan: true,
        autoPanPaddingTopLeft: L.point(10, 60),
        autoPanPaddingBottomRight: L.point(10, 10),
      }).setContent(container);

      marker.on("click", () => {
        // flushSync renders content synchronously so Leaflet measures
        // the correct popup height before positioning it
        flushSync(() => {
          root.render(
            <MarkerBubble
              report={r}
              t={tRef.current}
              onClose={() => leafletPopup.close()}
            />
          );
        });
        // Explicitly set lat/lng and open — no ambiguity about position
        leafletPopup.setLatLng(marker.getLatLng()).openOn(mapRef.current);
      });

      layerRef.current.addLayer(marker);
    });

    if (located.length > 0 && !fitDoneRef.current) {
      try {
        const bounds = L.latLngBounds(located.map((r: Report) => [r.lat, r.lon]));
        mapRef.current.fitBounds(bounds.pad(0.25), { maxZoom: 9, animate: false });
        fitDoneRef.current = true;
      } catch {}
    }

    return () => {
      popupRoots.forEach(root => { try { root.unmount(); } catch {} });
    };
  }, [reports, onSelectReport]);

  // pickReset
  useEffect(() => {
    if (pickReset === undefined) return;
    if (pendingPinRef.current) { pendingPinRef.current.remove(); pendingPinRef.current = null; }
  }, [pickReset]);

  // update "Report here" marker with resolved place name
  useEffect(() => {
    if (!pickedLabel || !pendingPinRef.current) return;
    try {
      const el = pendingPinRef.current.getElement?.();
      if (el) {
        const label = el.querySelector("div > div:first-child") as HTMLElement | null;
        if (label) label.textContent = `📍 ${pickedLabel}`;
      }
    } catch {}
  }, [pickedLabel]);

  // flyTo
  useEffect(() => {
    if (!flyTo || !mapRef.current) return;
    if (flyToPrevRef.current?.[0] === flyTo[0] && flyToPrevRef.current?.[1] === flyTo[1]) return;
    flyToPrevRef.current = flyTo;
    mapRef.current.closePopup();
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

  // Close popup when page is scrolled (popup can overflow map bounds)
  useEffect(() => {
    const close = () => mapRef.current?.closePopup();
    window.addEventListener("scroll", close, { passive: true });
    return () => window.removeEventListener("scroll", close);
  }, []);

  // Ctrl+scroll to zoom
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      if (!mapRef.current) return;
      if (e.deltaY < 0) mapRef.current.zoomIn();
      else mapRef.current.zoomOut();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Close search dropdown on outside click
  useEffect(() => {
    function h(e: MouseEvent) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node))
        setSearchOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  function handleSearchSelect(p: Place) {
    if (!mapRef.current) return;
    mapRef.current.flyTo([p.lat, p.lon], Math.max(mapRef.current.getZoom(), 13), { duration: 0.8 });
    setSearchQ(p.name);
    setSearchOpen(false);
  }

  function handleLocateInMap() {
    if (!navigator.geolocation || !mapRef.current) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        const m = mapRef.current;
        if (m) m.flyTo([pos.coords.latitude, pos.coords.longitude], Math.max(m.getZoom(), 13), { duration: 0.8 });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  const locatedCount = reports.filter(r => r.lat !== null).length;

  return (
    <div ref={outerRef} className="relative h-full w-full">
      {/* Map canvas — overflow-hidden clips tiles to rounded border */}
      <div className="absolute inset-0 rounded-2xl overflow-hidden border border-border bg-card shadow-soft">
        <div ref={containerRef} className="absolute inset-0 bg-[#dde7f0]" />
      </div>

      {/* Search bar — centered top, outside overflow-hidden so dropdown isn't clipped */}
      <div ref={searchBoxRef} className="absolute top-3 left-1/2 z-[600] w-full max-w-[520px] -translate-x-1/2 px-3">
        <div className="flex items-center gap-2 rounded-full border border-border bg-white/95 px-4 py-2.5 shadow-float backdrop-blur focus-within:ring-2 focus-within:ring-primary/40">
          {searchLoading
            ? <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            : <Search className="h-4 w-4 shrink-0 text-muted-foreground" />}
          <input
            type="text"
            value={searchQ}
            onChange={e => { setSearchQ(e.target.value); setSearchOpen(!!e.target.value); }}
            onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
            placeholder="Search a place…"
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <button onClick={handleLocateInMap} disabled={locating} title="My location"
            className="shrink-0 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary transition-colors disabled:opacity-60">
            {locating ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <span className="text-sm">📍</span>}
          </button>
          {searchQ && (
            <button onClick={() => { setSearchQ(""); setSearchOpen(false); }}
              className="h-5 w-5 shrink-0 rounded-full bg-muted text-muted-foreground text-xs flex items-center justify-center hover:bg-secondary">✕</button>
          )}
        </div>
        {searchOpen && searchResults.length > 0 && (
          <div className="mt-1.5 overflow-hidden rounded-2xl border border-border bg-white shadow-float">
            {searchResults.map((p, i) => (
              <button key={`${p.lat}-${p.lon}-${i}`} onClick={() => handleSearchSelect(p)}
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

      {/* Zoom controls — bottom right */}
      <div className="absolute bottom-10 right-4 z-[500] flex flex-col rounded-xl border border-border bg-white/95 shadow-float backdrop-blur overflow-hidden">
        <button
          onClick={() => mapRef.current?.zoomIn()}
          className="flex h-10 w-10 items-center justify-center text-xl font-light text-foreground hover:bg-secondary transition-colors border-b border-border"
          title="Zoom in"
        >+</button>
        <button
          onClick={() => mapRef.current?.zoomOut()}
          className="flex h-10 w-10 items-center justify-center text-xl font-light text-foreground hover:bg-secondary transition-colors"
          title="Zoom out"
        >−</button>
      </div>

      {/* Layer switcher — bottom center, own dedicated space */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[500] flex flex-row gap-0.5 rounded-full border border-border bg-white/95 shadow-float backdrop-blur p-0.5">
        {(Object.keys(TILE_LAYERS) as TileKey[]).map(key => (
          <button key={key} onClick={() => onLayerChange(key)} title={TILE_LAYERS[key].label}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${activeLayer === key ? "bg-foreground text-background" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
            <span className="text-sm">{TILE_LAYERS[key].icon}</span>
            <span>{TILE_LAYERS[key].label}</span>
          </button>
        ))}
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
  const gdacsAlerts = useGDACS();

  const [activeSeverities, setActiveSeverities] = useState<Set<Severity>>(() => new Set(["critical", "warn", "safe"] as Severity[]));
  const [showAllReports, setShowAllReports] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [flyTo, setFlyTo] = useState<[number, number] | null>(null);
  const [mapResetView, setMapResetView] = useState(0);

  const [showFilters, setShowFilters] = useState(false);
  const [showFeed, setShowFeed] = useState(true);
  const [activeLayer, setActiveLayer] = useState<TileKey>("satellite");

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

  function openReportFlow() { setReportFlowOpen(true); }

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
      <section className="relative mx-auto w-full max-w-[860px] px-4 pt-4 pb-2 md:px-6 md:pt-6 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-white/70 px-3 py-1 text-[11px] font-medium text-foreground shadow-soft backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          {reports.length > 0 ? `${reports.length} live reports worldwide` : "Community powered disaster watch"}
        </div>

        <h1 className="mx-auto mt-3 max-w-2xl font-display text-3xl font-bold leading-[1.05] tracking-tight text-foreground md:text-5xl">
          See something?{" "}
          <span className="bg-gradient-to-r from-primary via-sky-500 to-accent bg-clip-text text-transparent">
            Tell your neighbors.
          </span>
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground md:text-base">
          Real-time disaster awareness, powered by your community. Locals report floods, road closures, and outages — watch it map live before official news reaches you.
        </p>
      </section>

      {/* ── LIVE TICKER — full viewport width ───────────────── */}
      <LiveTicker />

      {/* ── MAP ─────────────────────────────────────────────── */}
      <section id="map" className="mx-auto w-full max-w-[1400px] px-4 pb-10 md:px-6">
        <div className="relative h-[640px] w-full overflow-visible">
          <LiveMap
            reports={filteredReports}
            flyTo={flyTo}
            resetView={mapResetView}
            onMapPick={handleMapPick}
            onSelectReport={r => setDetailReport(r)}
            pickReset={mapPickReset}
            pickedLabel={mapPickPlace?.name ?? null}
            activeLayer={activeLayer}
            onLayerChange={setActiveLayer}
          />

          {/* Floating toggle buttons — always visible */}
          <div className="pointer-events-none absolute left-4 top-4 z-[450] flex flex-row gap-2">
            <button
              onClick={() => setShowFilters(v => !v)}
              className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-white/95 px-3 py-1.5 text-xs font-semibold text-foreground shadow-float backdrop-blur hover:bg-white"
            >
              <Filter className="h-3.5 w-3.5 text-primary" />
              Filters
              {(activeSeverities.size < 3 || activeCategory) && (
                <span className="ml-0.5 rounded-full bg-foreground px-1.5 text-[10px] text-background">
                  {(3 - activeSeverities.size) + (activeCategory ? 1 : 0)}
                </span>
              )}
            </button>
          </div>

          <div className="pointer-events-none absolute right-4 top-4 z-[450] flex flex-col items-end gap-2">
            <button
              onClick={() => setShowFeed(v => !v)}
              className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-white/95 px-3 py-1.5 text-xs font-semibold text-foreground shadow-float backdrop-blur hover:bg-white"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live updates
              <span className="ml-0.5 rounded-full bg-foreground px-1.5 text-[10px] text-background">
                {filteredReports.length}
              </span>
            </button>
          </div>

          {/* Floating FILTERS card — left */}
          {showFilters && (
            <aside className="pointer-events-none absolute left-4 top-16 z-[450] w-[min(280px,calc(100%-2rem))]">
              <div className="pointer-events-auto rounded-2xl border border-border bg-white/95 p-3 shadow-float backdrop-blur">
                <div className="flex items-center gap-2">
                  <Filter className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-semibold text-foreground">Filters</span>
                  {(activeSeverities.size < 3 || activeCategory) && (
                    <button onClick={resetFilters} className="ml-auto text-[11px] font-medium text-primary hover:underline">Reset</button>
                  )}
                  <button onClick={() => setShowFilters(false)} className="rounded-full p-1 text-muted-foreground hover:bg-secondary">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Severity</div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {(["critical","warn","safe"] as Severity[]).map(s => {
                      const sv = SEV[s];
                      return (
                        <button key={s} onClick={() => toggleSeverity(s)}
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition ${activeSeverities.has(s) ? "border-foreground bg-foreground text-background" : "border-border bg-white text-foreground hover:bg-secondary"}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${sv.dot}`} />{sv.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {categories.length > 0 && (
                  <div className="mt-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Category</div>
                    <div className="mt-1.5 flex max-h-24 flex-wrap gap-1 overflow-y-auto">
                      <button onClick={() => setActiveCategory(null)}
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition ${!activeCategory ? "border-foreground bg-foreground text-background" : "border-border bg-white text-foreground hover:bg-secondary"}`}>
                        All
                      </button>
                      {categories.map(c => {
                        const cm = catMeta(c);
                        return (
                          <button key={c} onClick={() => setActiveCategory(activeCategory === c ? null : c)}
                            className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition ${activeCategory === c ? "border-foreground bg-foreground text-background" : "border-border bg-white text-foreground hover:bg-secondary"}`}>
                            {cm.emoji} {c}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="mt-3 text-[10px] text-muted-foreground">
                  Showing <span className="font-semibold text-foreground">{filteredReports.length}</span> of {reports.length}.
                </div>
              </div>
            </aside>
          )}

          {/* Floating LIVE UPDATES card — right */}
          {showFeed && (
            <aside className="pointer-events-none absolute right-4 top-16 z-[450] hidden w-[230px] md:block">
              <div className="pointer-events-auto flex max-h-[380px] flex-col overflow-hidden rounded-xl border border-border bg-white/95 shadow-float backdrop-blur">
                <div className="flex items-center justify-between border-b border-border/60 px-2.5 py-1.5">
                  <div className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[11px] font-semibold text-foreground">Live</span>
                    <span className="text-[10px] text-muted-foreground">· {filteredReports.length}</span>
                  </div>
                  <button onClick={() => setShowFeed(false)} className="rounded-full p-0.5 text-muted-foreground hover:bg-secondary">
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <div className="flex-1 space-y-1 overflow-y-auto p-1.5">
                  {status !== "live" && filteredReports.length === 0 ? (
                    <div className="space-y-1 p-1 animate-pulse">
                      {[1,2,3].map(i => <div key={i} className="h-12 bg-secondary rounded-lg" />)}
                    </div>
                  ) : filteredReports.length === 0 ? (
                    <div className="py-6 text-center text-[10px] text-muted-foreground">No incidents match filters.</div>
                  ) : filteredReports.slice(0, 20).map(r => (
                    <article key={r.id} onClick={() => {
                      if (r.lat && r.lon) setFlyTo([r.lat, r.lon]);
                    }} className={`cursor-pointer rounded-lg border border-border/60 p-1.5 transition hover:bg-secondary/50 ${flashId === r.id ? "bg-primary/5" : ""}`}>
                      <div className="flex items-center gap-1.5">
                        <img
                          src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${r.id}`}
                          alt=""
                          className="h-6 w-6 shrink-0 rounded-full border border-border bg-secondary"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[10px] font-semibold text-foreground">{r.district}{r.place ? ` · ${r.place}` : ""}</div>
                          <div className="truncate text-[9px] text-muted-foreground">{formatReportTime(r.created_at)}</div>
                        </div>
                      </div>
                      <p className="mt-1 text-[10px] leading-snug text-foreground/80 line-clamp-2">{r.message}</p>
                    </article>
                  ))}
                </div>
              </div>
            </aside>
          )}

          {mapPickLoading && (
            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-[500] flex items-center gap-2 rounded-full bg-card border border-border px-4 py-2 text-sm font-semibold shadow-float">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              Finding location…
            </div>
          )}
        </div>
      </section>

      {/* ── FEED GRID ────────────────────────────────────────── */}
      <section id="feed" className="mx-auto w-full max-w-[1400px] px-4 py-10 md:px-6">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold text-foreground md:text-3xl">Latest from the community</h2>
            <p className="mt-1 text-sm text-muted-foreground">Verified by neighbors, sourced from the field.</p>
          </div>
          <a href="#map" className="hidden text-sm font-medium text-primary hover:underline md:inline-flex md:items-center md:gap-1">
            See on map <ArrowRight className="h-4 w-4" />
          </a>
        </div>
        <div className="mt-5">
        {status !== "live" ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[1,2,3,4,5,6,7,8].map(i => (
              <div key={i} className="rounded-xl border border-border bg-card overflow-hidden animate-pulse">
                <div className="h-20 bg-secondary" />
                <div className="p-3 space-y-2">
                  <div className="flex gap-2"><div className="h-4 w-14 rounded-full bg-secondary" /><div className="h-4 w-10 rounded-full bg-secondary" /></div>
                  <div className="h-3 bg-secondary rounded w-full" />
                  <div className="h-3 bg-secondary rounded w-3/4" />
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-stretch">
            {filteredReports.slice(0, 8).map(r => (
              <IncidentCard key={r.id} report={r} flash={flashId === r.id} onSelect={() => setDetailReport(r)} />
            ))}
          </div>
        )}
        {filteredReports.length > 6 && (
          <div className="mt-6 text-center">
            <button onClick={() => setShowAllReports(true)}
              className="rounded-full border border-border bg-white/70 backdrop-blur px-6 py-2.5 text-sm font-medium text-foreground hover:bg-secondary transition-colors">
              View all {filteredReports.length} reports
            </button>
          </div>
        )}
        </div>
      </section>

      {/* ── ALERTS ───────────────────────────────────────────── */}
      <section id="alerts" className="mx-auto w-full max-w-[1400px] px-4 pb-12 md:px-6">
        <h2 className="font-display text-2xl font-bold text-foreground md:text-3xl">Official alerts</h2>
        <p className="mt-1 text-sm text-muted-foreground">Verified advisories from NDMA, IMD, GDACS and district authorities.</p>
        <div className="mt-5">
          {alertStatus === "loading" ? (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {[1,2,3,4].map(i => <div key={i} className="shrink-0 w-72 h-28 rounded-2xl bg-secondary animate-pulse" />)}
            </div>
          ) : alerts.length === 0 && gdacsAlerts.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card py-12 text-center">
              <p className="text-3xl mb-2">✅</p>
              <p className="font-semibold text-foreground">No active official alerts</p>
              <p className="text-sm text-muted-foreground mt-1">All official advisory feeds are clear right now</p>
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-3 -mx-4 px-4 md:-mx-6 md:px-6"
              style={{ scrollbarWidth: "none" }}>
              {alerts.map(a => (
                <div key={a.id} className="snap-start shrink-0 w-72">
                  <AlertCard alert={a} />
                </div>
              ))}
              {gdacsAlerts.map(e => (
                <div key={e.id} className="snap-start shrink-0 w-72">
                  <GDACSAlertCard event={e} />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────── */}
      <section id="how" className="mx-auto w-full max-w-[1400px] px-4 pb-20 md:px-6">
        <div className="rounded-[28px] bg-gradient-to-br from-sky-100 via-white to-accent/60 p-6 md:p-10">
          <h2 className="font-display text-2xl font-bold text-foreground md:text-3xl">
            Built for small towns and the whole world.
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
            Three simple steps. No app to download, no account required.
          </p>
          <div className="mt-7 grid gap-4 md:grid-cols-3">
            {[
              { Icon: Camera, t: "1. Spot it", d: "See a flooded road, fallen tree, power outage? Snap a photo and drop a pin." },
              { Icon: CheckCircle2, t: "2. Neighbors verify", d: "People nearby confirm, dispute, or add context. Truth surfaces fast." },
              { Icon: MessageSquare, t: "3. The world sees", d: "Verified reports appear on the live map and reach responders in seconds." },
            ].map(({ Icon, t: title, d }) => (
              <div key={title} className="rounded-2xl border border-white/70 bg-white/80 p-5 backdrop-blur">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-foreground text-background">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold text-foreground">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{d}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><ShieldAlert className="h-3.5 w-3.5 text-emerald-500" /> Community verified</span>
            <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-primary" /> Works worldwide</span>
            <span className="inline-flex items-center gap-1.5"><MessageCircle className="h-3.5 w-3.5 text-accent-foreground" /> Free and open</span>
          </div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────── */}
      <footer className="border-t border-border bg-white/60 py-8 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1400px] flex-col items-center justify-between gap-3 px-6 text-xs text-muted-foreground md:flex-row">
          <span>© {new Date().getFullYear()} LiveKerala — A crowdsourced safety map.</span>
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
      {showAllReports && <AllReportsModal reports={filteredReports} onClose={() => setShowAllReports(false)} onSelect={r => setDetailReport(r)} />}
      {loadingPhase !== "hidden" && <LoadingScreen fading={loadingPhase === "fading"} waking={waking} />}
    </div>
  );
}

/* ─── Report Flow Modal ──────────────────────────────────────── */
function ReportFlowModal({ onClose, onReported, initialPlace, initialMessage }: {
  onClose: () => void; onReported: () => void; initialPlace?: Place; initialMessage?: string;
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
          : selectedPlace ? <ReportFormStep place={selectedPlace} onBack={() => setStep("location")} onClose={onClose} onReported={onReported} initialMessage={initialMessage} /> : null}
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

function ReportFormStep({ place, onBack, onClose, onReported, initialMessage }: { place: Place; onBack: () => void; onClose: () => void; onReported: () => void; initialMessage?: string }) {
  const { t } = useLanguage();
  const [severity, setSeverity] = useState<Severity>("warn");
  const [category, setCategory] = useState<string | null>(null);
  const [message, setMessage] = useState(initialMessage ?? "");
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
  const { t } = useLanguage();
  const { data, loading } = useReportDetail(report.id);
  const [localCounts, setLocalCounts] = useState<{ confirmed: number; incorrect: number; resolved: number } | null>(null);
  const [voted, setVoted] = useState<string | null>(null);
  const [comments, setComments] = useState<ApiComment[]>([]);
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [posting, setPosting] = useState(false);
  const [imgExpanded, setImgExpanded] = useState(false);
  const anonName = useRef(`user_${Math.random().toString(36).slice(2, 8)}`);
  const sev = SEV[report.severity];
  const cat = catMeta(report.category);
  const imgUrl = data?.images?.[0]?.file_path ? `${UPLOADS_ORIGIN}/uploads/${data.images[0].file_path}` : report.image_url;

  useEffect(() => {
    if (data) {
      setLocalCounts({ confirmed: data.confirmed_count ?? 0, incorrect: data.incorrect_count ?? 0, resolved: data.resolved_count ?? 0 });
      setComments(data.comments ?? []);
    }
  }, [data]);

  async function vote(kind: "confirm" | "incorrect" | "resolved") {
    if (voted) return;
    setVoted(kind);
    setLocalCounts(c => c ? { ...c, [kind === "confirm" ? "confirmed" : kind]: (c[kind === "confirm" ? "confirmed" : kind as "incorrect" | "resolved"]) + 1 } : c);
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
      if (res.ok) {
        setComments(prev => [...prev, { id: Date.now(), author_name: anonName.current, content: text, created_at: new Date().toISOString() }]);
        setCommentText("");
      }
    } finally { setPosting(false); }
  }

  return (
    <>
      {imgExpanded && imgUrl && (
        <div className="fixed inset-0 z-[9500] flex items-center justify-center bg-black/90 p-4" onClick={() => setImgExpanded(false)}>
          <img src={imgUrl} alt="" className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl" />
          <button onClick={() => setImgExpanded(false)} className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-white/20 text-white hover:bg-white/30">✕</button>
        </div>
      )}

      {/* Compact map popup card — bottom-left, no backdrop */}
      <div className="fixed bottom-4 left-4 z-[9000] w-[340px] max-w-[calc(100vw-2rem)] float-in">
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-float">
          {/* Severity bar */}
          <div className={`h-1 w-full ${sev.bar}`} />

          {/* Image strip */}
          {imgUrl && (
            <button onClick={() => setImgExpanded(true)} className="block w-full overflow-hidden h-28 bg-secondary">
              <img src={imgUrl} alt="" className="w-full h-full object-cover hover:brightness-90 transition" />
            </button>
          )}

          {/* Header */}
          <div className="flex items-start gap-2 px-4 pt-3 pb-1">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`text-[10px] font-bold uppercase tracking-wider ${sev.text}`}>{sev.label}</span>
                <span className="text-muted-foreground/50 text-[10px]">·</span>
                <span className="text-[10px] font-medium text-muted-foreground">{cat.emoji} {t[cat.labelKey as keyof typeof t] as string}</span>
                <span className="text-muted-foreground/50 text-[10px]">·</span>
                <span className="text-[10px] text-muted-foreground">{formatReportTime(report.created_at)}</span>
              </div>
              <h3 className="font-display text-sm font-bold text-foreground mt-0.5 leading-snug">
                {report.place ? `${report.place} · ${report.district}` : report.district}
              </h3>
            </div>
            <button onClick={onClose}
              className="shrink-0 grid h-7 w-7 place-items-center rounded-full bg-secondary text-muted-foreground hover:bg-border transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Message */}
          <div className="px-4 pt-1 pb-3 border-b border-border/60">
            <p className="text-sm leading-relaxed text-foreground">{report.message}</p>
          </div>

          {/* Vote row */}
          <div className="flex border-b border-border/60">
            {loading ? (
              <div className="flex-1 h-10 animate-pulse bg-secondary/50" />
            ) : localCounts ? (
              <>
                {(([
                  { kind: "confirm" as const, icon: "👍", count: localCounts.confirmed, active: "bg-emerald-50 text-emerald-700" },
                  { kind: "incorrect" as const, icon: "👎", count: localCounts.incorrect, active: "bg-red-50 text-red-700" },
                  { kind: "resolved" as const, icon: "✓", count: localCounts.resolved, active: "bg-blue-50 text-blue-700" },
                  { kind: null, icon: "👁", count: data?.views_count ?? 0, active: "" },
                ] as Array<{ kind: "confirm" | "incorrect" | "resolved" | null; icon: string; count: number; active: string }>)).map(({ kind, icon, count, active }) => (
                  <button key={String(kind)} onClick={() => kind && vote(kind)} disabled={!kind || !!voted}
                    className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-bold border-r border-border/40 last:border-r-0 transition-colors disabled:cursor-default ${voted === kind ? active : !kind ? "text-muted-foreground/60" : "text-muted-foreground hover:bg-secondary"}`}>
                    <span className="text-sm leading-none">{icon}</span>
                    <span>{count}</span>
                    {voted === kind && <span className="text-[9px] text-success">✓ voted</span>}
                  </button>
                ))}
              </>
            ) : null}
          </div>

          {/* Comment input + toggle */}
          <div className="px-3 py-2">
            <form onSubmit={submitComment} className="flex items-center gap-2">
              <input value={commentText} onChange={e => setCommentText(e.target.value)}
                placeholder="Add a note…"
                className="flex-1 min-w-0 rounded-full border border-border bg-secondary px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/25"
              />
              <button type="submit" disabled={posting || !commentText.trim()}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-foreground text-background hover:opacity-90 disabled:opacity-30 transition-opacity">
                {posting ? <span className="text-[10px]">…</span> : <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" /></svg>}
              </button>
            </form>
            {comments.length > 0 && (
              <button onClick={() => setShowComments(v => !v)} className="mt-1.5 text-[10px] font-medium text-primary hover:underline">
                {showComments ? "Hide comments" : `${comments.length} comment${comments.length !== 1 ? "s" : ""}`}
              </button>
            )}
            {showComments && (
              <div className="mt-2 space-y-1 max-h-28 overflow-y-auto">
                {comments.map(c => (
                  <div key={c.id} className="rounded-lg bg-secondary px-3 py-2">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-primary">{c.author_name}</p>
                    <p className="text-[11px] leading-snug text-foreground mt-0.5">{c.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
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
