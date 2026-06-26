import { useEffect, useMemo, useRef, useState } from "react";
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
  district: string;
  slug: string;
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

const DISTRICTS: District[] = [
  { code: "KL-01", name: "Trivandrum",     slug: "trivandrum",     lat: 8.5241,  lon: 76.9366 },
  { code: "KL-02", name: "Kollam",         slug: "kollam",         lat: 8.8932,  lon: 76.6141 },
  { code: "KL-03", name: "Pathanamthitta", slug: "pathanamthitta", lat: 9.2648,  lon: 76.787  },
  { code: "KL-04", name: "Alappuzha",      slug: "alappuzha",      lat: 9.4981,  lon: 76.3388 },
  { code: "KL-05", name: "Kottayam",       slug: "kottayam",       lat: 9.5916,  lon: 76.5222 },
  { code: "KL-06", name: "Idukki",         slug: "idukki",         lat: 9.85,    lon: 76.97   },
  { code: "KL-07", name: "Ernakulam",      slug: "ernakulam",      lat: 9.9816,  lon: 76.2999 },
  { code: "KL-08", name: "Thrissur",       slug: "thrissur",       lat: 10.5276, lon: 76.2144 },
  { code: "KL-09", name: "Palakkad",       slug: "palakkad",       lat: 10.7867, lon: 76.6548 },
  { code: "KL-10", name: "Malappuram",     slug: "malappuram",     lat: 11.041,  lon: 76.0788 },
  { code: "KL-11", name: "Kozhikode",      slug: "kozhikode",      lat: 11.2588, lon: 75.7804 },
  { code: "KL-12", name: "Wayanad",        slug: "wayanad",        lat: 11.6854, lon: 76.132  },
  { code: "KL-13", name: "Kannur",         slug: "kannur",         lat: 11.8745, lon: 75.3704 },
  { code: "KL-14", name: "Kasaragod",      slug: "kasaragod",      lat: 12.4996, lon: 74.9869 },
];

const CATEGORY_META: Record<string, { emoji: string; label: string }> = {
  "Flood":             { emoji: "🌊", label: "Flood" },
  "Landslide":         { emoji: "⛰️", label: "Landslide" },
  "Road Damage":       { emoji: "🚧", label: "Road" },
  "Power Outage":      { emoji: "⚡", label: "Power" },
  "Medical Emergency": { emoji: "🚨", label: "Medical" },
  "Fire":              { emoji: "🔥", label: "Fire" },
  "Other":             { emoji: "📌", label: "Other" },
};

const KERALA_CENTER = { lat: 10.5, lon: 76.3 };
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

function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function resolveDistrict(f: PhotonFeature): District {
  const p = f.properties;
  const candidates = [p.district, p.county, p.city, p.state].filter(Boolean) as string[];
  for (const c of candidates) {
    const hit = DISTRICTS.find(
      (d) =>
        c.toLowerCase().includes(d.name.toLowerCase()) ||
        d.name.toLowerCase().includes(c.toLowerCase()),
    );
    if (hit) return hit;
  }
  const [lon, lat] = f.geometry.coordinates;
  let best = DISTRICTS[0];
  let bestDist = Infinity;
  for (const d of DISTRICTS) {
    const dist = haversine({ lat, lon }, d);
    if (dist < bestDist) { bestDist = dist; best = d; }
  }
  return best;
}

function toPlace(f: PhotonFeature): Place {
  const p = f.properties;
  const [lon, lat] = f.geometry.coordinates;
  const district = resolveDistrict(f);
  const ctxParts = [p.city, p.county, p.state].filter(Boolean) as string[];
  const context = Array.from(new Set(ctxParts)).join(" · ");
  return {
    name: p.name ?? "Unknown",
    context: context || "Kerala, India",
    lat,
    lon,
    district: district.name,
    slug: district.slug,
  };
}

function mapApiReport(r: ApiReport): Report {
  const firstImage = r.images?.[0]?.file_path ?? null;
  return {
    id: String(r.id),
    district: r.district_name ?? "",
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
  const d = new Date(iso);
  return d.toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" });
}

function catMeta(c: string | null) {
  return CATEGORY_META[c ?? ""] ?? { emoji: "📌", label: "Other" };
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
    if (q.length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    const ctrl = new AbortController();
    const id = setTimeout(() => {
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lat=${KERALA_CENTER.lat}&lon=${KERALA_CENTER.lon}&limit=8`;
      fetch(url, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((data: { features: PhotonFeature[] }) => {
          const features = (data.features ?? []).filter((f) => {
            const s = (f.properties.state ?? "").toLowerCase();
            const c = (f.properties.country ?? "").toLowerCase();
            return s.includes("kerala") || (c.includes("india") && s === "");
          });
          setResults(features.map(toPlace));
        })
        .catch((e) => { if (e.name !== "AbortError") console.error(e); })
        .finally(() => setLoading(false));
    }, 250);
    return () => { ctrl.abort(); clearTimeout(id); };
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

  const refresh = () => setRefreshKey((k) => k + 1);

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

function useLocalTime() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const fmt = () => {
      const d = new Date();
      const ist = new Date(d.getTime() + (5.5 * 60 + d.getTimezoneOffset()) * 60000);
      setTime(`${ist.getHours().toString().padStart(2, "0")}:${ist.getMinutes().toString().padStart(2, "0")} IST`);
    };
    fmt();
    const id = setInterval(fmt, 30000);
    return () => clearInterval(id);
  }, []);
  return time;
}

/* ─── Module-level welcome flag ──────────────────────────────── */
const WELCOME_KEY = "lk_welcome_done";

/* ─── Loading Screen ────────────────────────────────────────── */
const LOADING_MESSAGES = [
  {
    headline: "Your neighbors are watching out for you.",
    sub: "Thousands of people across Kerala report what they see in real time.",
  },
  {
    headline: "Connecting to 14 districts…",
    sub: "Live reports from Trivandrum to Kasaragod are on their way.",
  },
  {
    headline: "Syncing official advisories…",
    sub: "Loading NDMA · IMD · KSDMA alerts for your area.",
  },
  {
    headline: "Together, we keep Kerala safe.",
    sub: "Every report you share helps someone near you make a better decision.",
  },
  {
    headline: "Real-time. Community-powered.",
    sub: "No algorithm, no delay — just neighbors helping neighbors.",
  },
  {
    headline: "Almost there…",
    sub: "Your live community feed is loading.",
  },
];

function LoadingScreen({ fading }: { fading: boolean }) {
  const [msgIdx, setMsgIdx] = useState(0);
  const [textVisible, setTextVisible] = useState(true);

  useEffect(() => {
    const id = setInterval(() => {
      setTextVisible(false);
      setTimeout(() => {
        setMsgIdx((i) => (i + 1) % LOADING_MESSAGES.length);
        setTextVisible(true);
      }, 350);
    }, 2400);
    return () => clearInterval(id);
  }, []);

  const msg = LOADING_MESSAGES[msgIdx];

  return (
    <div
      className={`fixed inset-0 z-[70] flex flex-col items-center justify-center bg-primary px-8 transition-opacity duration-700 ${
        fading ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      {/* Gold glow blobs */}
      <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[var(--color-gold)]/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-accent/20 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/3 h-80 w-80 -translate-x-1/2 rounded-full bg-[var(--color-gold)]/5 blur-3xl" />

      <div className="relative flex w-full max-w-xs flex-col items-center text-center">
        {/* Logo mark */}
        <div className="grid h-16 w-16 place-items-center rounded-full bg-[var(--color-gold)] font-display text-2xl font-bold text-primary shadow-xl shadow-black/30 ring-4 ring-[var(--color-gold)]/30 mb-5">
          L
        </div>

        <div className="font-display text-2xl font-bold text-primary-foreground">
          Live<span className="text-[var(--color-gold)]">Kerala</span>
        </div>
        <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-foreground/50">
          Community · Live · Safe
        </p>

        {/* Animated pulse dots */}
        <div className="mt-8 flex items-center gap-2 mb-10">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="rounded-full bg-[var(--color-gold)]"
              style={{
                width: i === 2 ? "0.625rem" : "0.375rem",
                height: i === 2 ? "0.625rem" : "0.375rem",
                opacity: i === 2 ? 1 : 0.4,
                animation: `live-pulse 1.6s ease-out ${i * 0.15}s infinite`,
              }}
            />
          ))}
        </div>

        {/* Rotating motivational message */}
        <div
          className="min-h-[5rem] transition-opacity duration-300"
          style={{ opacity: textVisible ? 1 : 0 }}
        >
          <p className="font-display text-[18px] font-bold leading-snug text-primary-foreground">
            {msg.headline}
          </p>
          <p className="mt-2.5 text-sm leading-relaxed text-primary-foreground/65">
            {msg.sub}
          </p>
        </div>

        {/* Progress bar */}
        <div className="mt-10 h-0.5 w-32 overflow-hidden rounded-full bg-primary-foreground/15">
          <div
            className="h-full rounded-full bg-[var(--color-gold)]"
            style={{ animation: "loading-bar 2.4s ease-in-out infinite" }}
          />
        </div>
      </div>

      {/* Bottom live chip */}
      <div className="absolute bottom-10 flex items-center gap-2 rounded-full border border-primary-foreground/10 bg-primary-foreground/5 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-primary-foreground/50">
        <span className="live-dot" />
        Loading live data
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
function SiteHeader({
  reportsCount,
  status,
  onReport,
  lang,
  toggle,
}: {
  reportsCount: number;
  status: "connecting" | "live" | "offline";
  onReport: () => void;
  lang: string;
  toggle: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/50 bg-background/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3 sm:px-8 lg:px-10">
        {/* Logo */}
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary font-display text-base font-bold text-primary-foreground ring-2 ring-[var(--color-gold)]/40">
            L
          </div>
          <div className="min-w-0">
            <div className="font-display text-lg font-bold tracking-tight text-primary">
              Live<span className="text-[var(--color-gold)]">Kerala</span>
            </div>
            <div className="hidden items-center gap-1.5 text-[11px] font-medium text-muted-foreground sm:flex">
              <span className="live-dot" />
              {status === "live" ? `${reportsCount} live` : status === "connecting" ? "Connecting…" : "Offline"}
              {" · "}Community disaster watch
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={toggle}
            className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-primary/60 transition hover:bg-secondary"
          >
            {lang === "en" ? "മ" : "EN"}
          </button>
          <button
            type="button"
            onClick={onReport}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--color-gold)] px-4 py-2 text-sm font-bold text-primary shadow-sm transition hover:brightness-105 active:scale-95"
          >
            <span aria-hidden>＋</span>
            <span>Report</span>
          </button>
        </nav>
      </div>
    </header>
  );
}

/* ─── Main Page ─────────────────────────────────────────────── */
export function HomePage() {
  const { lang, t, toggle } = useLanguage();
  const time = useLocalTime();
  const { reports, status, flashId, refresh: refreshFeed } = useLiveReports(50);
  const { alerts, status: alertStatus } = useKeralaAlerts();

  const [filterDistrict, setFilterDistrict] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(15);

  const [reportFlowOpen, setReportFlowOpen] = useState(false);
  const [districtFocus, setDistrictFocus] = useState<string | null>(null);
  const [detailReport, setDetailReport] = useState<Report | null>(null);
  const [welcomeOpen, setWelcomeOpen] = useState(() => !localStorage.getItem(WELCOME_KEY));
  const [loadingPhase, setLoadingPhase] = useState<"hidden" | "active" | "fading">("hidden");
  const [loadingMinPassed, setLoadingMinPassed] = useState(false);

  useEffect(() => { setVisibleCount(15); }, [filterDistrict, filterCategory, searchQuery]);

  function dismissWelcome() {
    localStorage.setItem(WELCOME_KEY, "1");
    setWelcomeOpen(false);
    setLoadingMinPassed(false);
    setLoadingPhase("active");
    setTimeout(() => setLoadingMinPassed(true), 2200);
  }

  useEffect(() => {
    if (loadingPhase === "active" && loadingMinPassed && status === "live" && alertStatus !== "loading") {
      setLoadingPhase("fading");
      const t = setTimeout(() => setLoadingPhase("hidden"), 750);
      return () => clearTimeout(t);
    }
  }, [loadingPhase, loadingMinPassed, status, alertStatus]);

  const filteredReports = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return reports
      .filter((r) => filterDistrict === "all" || r.district === filterDistrict)
      .filter((r) => filterCategory === "all" || r.category === filterCategory)
      .filter((r) => !q || r.message.toLowerCase().includes(q) || (r.place ?? "").toLowerCase().includes(q));
  }, [reports, filterDistrict, filterCategory, searchQuery]);

  const pulseDistricts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of reports) counts.set(r.district, (counts.get(r.district) ?? 0) + 1);
    return DISTRICTS.map((d) => ({ ...d, count: counts.get(d.name) ?? 0 }))
      .sort((a, b) => b.count - a.count);
  }, [reports]);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader
        reportsCount={reports.length}
        status={status}
        onReport={() => setReportFlowOpen(true)}
        lang={lang}
        toggle={toggle}
      />

      {/* ══ FULL-WIDTH HERO ══ */}
      <section className="relative overflow-hidden bg-primary">
        <div aria-hidden className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-[var(--color-gold)]/10 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-20 left-1/3 h-56 w-56 rounded-full bg-accent/15 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute bottom-0 right-1/4 h-40 w-40 rounded-full bg-[var(--color-gold)]/8 blur-2xl" />

        <div className="relative mx-auto max-w-6xl px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
          <div className="flex items-center justify-between gap-10">
            {/* Left: Headline + CTA */}
            <div className="min-w-0 flex-1">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-primary-foreground/80">
                <span className="live-dot" />
                {reports.length} live reports · {time || "—"}
              </span>
              <h1 className="mt-5 font-display text-4xl font-bold leading-tight tracking-tight text-primary-foreground lg:text-5xl xl:text-[56px]">
                Namaskaram,{" "}
                <span className="text-[var(--color-gold)]">Neighbor.</span>
              </h1>
              <p className="mt-3 max-w-lg text-base leading-relaxed text-primary-foreground/70 lg:text-[15px]">
                See something on the road, in your area, or near home? Tell your neighbors. They'll do the same for you.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setReportFlowOpen(true)}
                  className="inline-flex items-center gap-2.5 rounded-2xl bg-[var(--color-gold)] px-7 py-3.5 font-display text-sm font-bold text-primary shadow-lg shadow-black/20 transition hover:brightness-105 active:scale-[0.98]"
                >
                  <span aria-hidden>＋</span> Report an Incident
                </button>
                <button
                  type="button"
                  onClick={() => setDistrictFocus(pulseDistricts[0]?.name ?? null)}
                  className="inline-flex items-center gap-2 rounded-2xl border border-primary-foreground/20 px-6 py-3.5 text-sm font-semibold text-primary-foreground/75 transition hover:bg-primary-foreground/10"
                >
                  Browse Districts →
                </button>
              </div>
            </div>

            {/* Right: Live stat cards (desktop only) */}
            <div className="hidden shrink-0 lg:grid lg:w-64 lg:grid-cols-2 lg:gap-3 xl:w-72">
              <div className="rounded-2xl bg-primary-foreground/10 p-4 text-center backdrop-blur-sm">
                <div className="font-display text-3xl font-bold tabular-nums text-primary-foreground">{reports.length}</div>
                <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-primary-foreground/60">Live Reports</div>
              </div>
              <div className="rounded-2xl bg-primary-foreground/10 p-4 text-center backdrop-blur-sm">
                <div className="font-display text-3xl font-bold tabular-nums text-[var(--color-gold)]">
                  {pulseDistricts.filter((d) => d.count > 0).length}
                </div>
                <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-primary-foreground/60">Active Districts</div>
              </div>
              <div className="col-span-2 flex items-center gap-2 rounded-2xl bg-primary-foreground/10 px-4 py-3 backdrop-blur-sm">
                <span className="live-dot shrink-0" />
                <span className="text-xs font-semibold text-primary-foreground/70">
                  {status === "live" ? "Feed updating every 20 seconds" : status === "connecting" ? "Connecting…" : "Feed offline"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ 3-COLUMN APP LAYOUT ══ */}
      <div className="flex">

        {/* ── LEFT NAV SIDEBAR ── */}
        <aside className="hidden lg:block lg:w-60 xl:w-64 shrink-0 border-r border-border/70">
          <div className="sticky top-[61px] flex h-[calc(100vh-61px)] flex-col overflow-y-auto no-scrollbar">
            <div className="flex-1 space-y-5 p-4 xl:p-5">

              {/* Live status */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Live Status</p>
                <div className="flex items-center gap-2 rounded-xl bg-secondary px-3 py-2.5">
                  <span className="live-dot shrink-0" />
                  <span className="text-xs font-semibold text-primary">
                    {status === "live" ? `${reports.length} reports · live` : status === "connecting" ? "Connecting…" : "Offline"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-border bg-card p-3 text-center">
                    <div className="font-display text-xl font-bold tabular-nums text-primary">{reports.length}</div>
                    <div className="text-[10px] font-bold uppercase text-muted-foreground">Reports</div>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-3 text-center">
                    <div className="font-display text-xl font-bold tabular-nums text-accent">
                      {pulseDistricts.filter((d) => d.count > 0).length}
                    </div>
                    <div className="text-[10px] font-bold uppercase text-muted-foreground">Districts</div>
                  </div>
                </div>
              </div>

              {/* Category nav */}
              <div className="space-y-0.5">
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Category</p>
                <button
                  type="button"
                  onClick={() => setFilterCategory("all")}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                    filterCategory === "all" ? "bg-primary text-primary-foreground font-semibold" : "text-primary hover:bg-secondary"
                  }`}
                >
                  <span className="text-base">✦</span>
                  <span className="font-medium">All Reports</span>
                  <span className={`ml-auto text-[11px] font-bold tabular-nums ${filterCategory === "all" ? "text-[var(--color-gold)]" : "text-muted-foreground"}`}>
                    {reports.length}
                  </span>
                </button>
                {Object.entries(CATEGORY_META).map(([k, v]) => {
                  const count = reports.filter((r) => r.category === k).length;
                  const isActive = filterCategory === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setFilterCategory(isActive ? "all" : k)}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                        isActive ? "bg-primary text-primary-foreground font-semibold" : "text-primary hover:bg-secondary"
                      }`}
                    >
                      <span className="text-base">{v.emoji}</span>
                      <span className="font-medium">{v.label}</span>
                      {count > 0 && (
                        <span className={`ml-auto text-[11px] font-bold tabular-nums ${isActive ? "text-[var(--color-gold)]" : "text-accent"}`}>
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* District nav */}
              <div className="space-y-0.5">
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Districts</p>
                <button
                  type="button"
                  onClick={() => setFilterDistrict("all")}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
                    filterDistrict === "all" ? "bg-primary text-primary-foreground font-semibold" : "text-primary hover:bg-secondary"
                  }`}
                >
                  <span className="font-medium">All Kerala</span>
                </button>
                {pulseDistricts.map((d) => {
                  const isActive = filterDistrict === d.name;
                  return (
                    <button
                      key={d.code}
                      type="button"
                      onClick={() => setFilterDistrict(isActive ? "all" : d.name)}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
                        isActive ? "bg-primary text-primary-foreground font-semibold" : "text-primary hover:bg-secondary"
                      }`}
                    >
                      <span className="font-medium">{d.name}</span>
                      <span className={`text-[11px] font-bold tabular-nums ${
                        isActive ? "text-[var(--color-gold)]" : d.count > 0 ? "text-accent" : "text-muted-foreground/25"
                      }`}>
                        {d.count > 0 ? d.count : "—"}
                      </span>
                    </button>
                  );
                })}
              </div>

            </div>

            {/* Report button pinned at bottom of left nav */}
            <div className="shrink-0 border-t border-border/70 p-4">
              <button
                type="button"
                onClick={() => setReportFlowOpen(true)}
                className="flex w-full items-center gap-2.5 rounded-xl bg-[var(--color-gold)] px-4 py-3 font-display text-sm font-bold text-primary transition hover:brightness-105 active:scale-[0.98]"
              >
                <span>＋</span> Report an Incident
              </button>
            </div>
          </div>
        </aside>

        {/* ── CENTER FEED ── */}
        <main className="min-w-0 flex-1 border-r border-border/70">
          <div className="mx-auto max-w-2xl px-4 pb-24 pt-6 lg:px-6">

            {/* Official alerts (mobile+desktop top of feed) */}
            {alertStatus === "ready" && alerts.filter((a) => a.severity !== "safe").length > 0 && (
              <div className="mb-4 rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-wider text-destructive">
                  ⚠ {alerts.filter((a) => a.severity !== "safe").length} official advisory · NDMA · IMD
                </p>
                {alerts.filter((a) => a.severity !== "safe").slice(0, 2).map((a) => (
                  <p key={a.id} className="mt-1 text-xs leading-snug text-foreground/75">
                    {a.disasterType} — {a.district ?? "Kerala"} · {a.source}
                  </p>
                ))}
              </div>
            )}

            {/* Mobile-only category filter strip */}
            <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">
              <button type="button" onClick={() => setFilterCategory("all")}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${filterCategory === "all" ? "bg-primary text-primary-foreground" : "border border-border text-primary"}`}>
                ✦ All
              </button>
              {Object.entries(CATEGORY_META).map(([k, v]) => (
                <button key={k} type="button" onClick={() => setFilterCategory(filterCategory === k ? "all" : k)}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${filterCategory === k ? "bg-primary text-primary-foreground" : "border border-border text-primary"}`}>
                  {v.emoji} {v.label}
                </button>
              ))}
            </div>

            {/* Mobile-only district filter strip */}
            <div className="no-scrollbar -mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 lg:hidden">
              <button type="button" onClick={() => setFilterDistrict("all")}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition ${filterDistrict === "all" ? "bg-primary text-primary-foreground" : "border border-border text-primary"}`}>
                All Kerala
              </button>
              {pulseDistricts.filter((d) => d.count > 0).map((d) => (
                <button key={d.code} type="button" onClick={() => setFilterDistrict(filterDistrict === d.name ? "all" : d.name)}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition ${filterDistrict === d.name ? "bg-primary text-primary-foreground" : "border border-border text-primary"}`}>
                  {d.name} <span className="text-accent font-bold">{d.count}</span>
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="mb-5">
              <label className="relative block">
                <span aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-primary/40">⌕</span>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search a place, report, or area…"
                  className="w-full rounded-2xl border border-border bg-card py-2.5 pl-9 pr-4 text-sm text-primary placeholder:text-primary/40 shadow-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
              </label>
            </div>

            {/* Feed header */}
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-primary">Latest from Neighbors</h2>
              <span className="text-xs font-semibold text-muted-foreground">
                {Math.min(visibleCount, filteredReports.length)} of {filteredReports.length}
              </span>
            </div>

            {/* Feed */}
            {filteredReports.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-14 text-center text-sm text-muted-foreground">
                Nothing matches these filters.
              </div>
            ) : (
              <div className="space-y-3">
                {filteredReports.slice(0, visibleCount).map((r) => (
                  <NeighborCard
                    key={r.id}
                    report={r}
                    flash={flashId === r.id}
                    onViewDetail={() => setDetailReport(r)}
                    onViewDistrict={() => setDistrictFocus(r.district)}
                  />
                ))}
              </div>
            )}

            {visibleCount < filteredReports.length && (
              <div className="mt-5 text-center">
                <button
                  type="button"
                  onClick={() => setVisibleCount((n) => n + 15)}
                  className="rounded-full border border-[var(--color-gold)]/40 bg-card px-7 py-2.5 text-sm font-bold text-primary shadow-sm transition hover:bg-secondary"
                >
                  Load more · {filteredReports.length - visibleCount} remaining
                </button>
              </div>
            )}

            <footer className="mt-12 text-center text-xs text-muted-foreground">
              {t.communityPowered}
            </footer>
          </div>
        </main>

        {/* ── RIGHT PANEL ── */}
        <aside className="hidden xl:block xl:w-72 shrink-0">
          <div className="sticky top-[61px] flex h-[calc(100vh-61px)] flex-col overflow-y-auto no-scrollbar">
            <div className="flex-1 space-y-4 p-5">

              {/* Official alerts (right panel) */}
              {alertStatus === "ready" && alerts.filter((a) => a.severity !== "safe").length > 0 ? (
                <div className="rounded-2xl border border-destructive/15 bg-destructive/5 p-4">
                  <p className="mb-2.5 text-[10px] font-bold uppercase tracking-wider text-destructive">
                    ⚠ Official Alerts · {alerts.filter((a) => a.severity !== "safe").length}
                  </p>
                  <div className="space-y-2">
                    {alerts.filter((a) => a.severity !== "safe").slice(0, 5).map((a) => (
                      <div key={a.id} className={`rounded-xl border-l-2 py-2 pl-3 pr-2 text-xs ${sevBorderL(a.severity)}`}>
                        <div className={`font-bold ${sevText(a.severity)}`}>{a.disasterType}</div>
                        <div className="text-muted-foreground">{a.district ?? "Kerala"} · {a.source}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-success/20 bg-success/5 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-success">✓ No Active Alerts</p>
                  <p className="mt-1 text-xs text-muted-foreground">No official advisories from NDMA, IMD, or KSDMA at this time.</p>
                </div>
              )}

              {/* Quick post */}
              <button
                type="button"
                onClick={() => setReportFlowOpen(true)}
                className="w-full rounded-2xl bg-primary p-5 text-left ring-1 ring-[var(--color-gold)]/20 transition hover:brightness-110 active:scale-[0.99]"
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--color-gold)] text-lg font-bold text-primary">＋</span>
                  <div>
                    <div className="font-display text-sm font-bold text-primary-foreground">Report what you see</div>
                    <div className="text-[11px] text-primary-foreground/60">Help your neighbors stay safe</div>
                  </div>
                </div>
              </button>

              {/* App info */}
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">About</p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  LiveKerala is a community-powered disaster watch platform. Reports are crowd-verified and supplemented with official NDMA · IMD · KSDMA advisories.
                </p>
              </div>

            </div>
          </div>
        </aside>

      </div>{/* end 3-col */}

      {/* ── Mobile floating bar ── */}
      <div className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4 lg:hidden">
        <button
          type="button"
          onClick={() => setReportFlowOpen(true)}
          className="flex w-full max-w-sm items-center justify-between gap-3 rounded-2xl bg-primary px-4 py-3 text-primary-foreground shadow-xl ring-1 ring-[var(--color-gold)]/30 transition active:scale-[0.99]"
        >
          <span className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--color-gold)] text-sm font-bold text-primary">＋</span>
            <span className="leading-tight">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-primary-foreground/70">Quick post</span>
              <span className="block text-sm font-semibold">Report what you're seeing</span>
            </span>
          </span>
          <span aria-hidden className="text-[var(--color-gold)]">→</span>
        </button>
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
        <ReportFlowModal onClose={() => setReportFlowOpen(false)} onReported={refreshFeed} />
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

/* ─── Category Tile ─────────────────────────────────────────── */
function CategoryTile({
  emoji, label, active, onClick,
}: { emoji: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group flex shrink-0 flex-col items-center gap-1.5">
      <span className={`grid h-12 w-12 place-items-center rounded-2xl border text-xl transition ${
        active
          ? "border-[var(--color-gold)]/60 bg-[var(--color-gold)]/20 text-primary shadow-sm"
          : "border-primary/10 bg-primary/5 text-primary group-hover:border-primary/20"
      }`}>
        {emoji}
      </span>
      <span className={`text-[10px] font-bold uppercase tracking-wider ${active ? "text-primary" : "text-primary/60"}`}>
        {label}
      </span>
    </button>
  );
}

/* ─── Neighbor Card ─────────────────────────────────────────── */
function NeighborCard({
  report, flash, onViewDetail, onViewDistrict,
}: {
  report: Report;
  flash: boolean;
  onViewDetail: () => void;
  onViewDistrict: () => void;
}) {
  const cat = catMeta(report.category);
  const initials = reportInitials(report.id);

  return (
    <article className={`flex flex-col gap-3 rounded-3xl border bg-card p-4 shadow-[var(--shadow-card)] transition sm:p-5 ${
      flash ? "border-[var(--color-gold)]/60 bg-[var(--color-gold)]/5" : "border-primary/5"
    }`}>
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-background font-display text-xs font-bold text-primary ring-1 ring-[var(--color-gold)]/30">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-primary">neighbor_{report.id.slice(-5)}</p>
            <p className="truncate text-[11px] font-medium text-accent">
              {formatReportTime(report.created_at)}
              {report.place && <> · {report.place}</>}
              {" · "}
              <button type="button" onClick={onViewDistrict} className="underline underline-offset-2">
                {report.district}
              </button>
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-lg bg-secondary px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
          <span className="mr-1" aria-hidden>{cat.emoji}</span>{cat.label}
        </span>
      </header>

      <button type="button" onClick={onViewDetail} className="text-left">
        <p className="text-[15px] leading-relaxed text-primary/90 text-pretty line-clamp-3">
          {report.message}
        </p>
        {report.image_url && (
          <img src={report.image_url} alt="" className="mt-2 w-full max-h-40 rounded-2xl object-cover" />
        )}
      </button>

      <footer className="flex items-center gap-4 pt-0.5">
        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${sevBadge(report.severity)}`}>
          {report.severity.toUpperCase()}
        </span>
        <button
          type="button"
          onClick={onViewDetail}
          className="ml-auto text-xs font-bold text-[var(--color-gold)] transition hover:underline"
        >
          View & Vote →
        </button>
      </footer>
    </article>
  );
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
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/30 backdrop-blur-sm sm:items-center p-4">
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
            <button
              type="button"
              onClick={onDismiss}
              className="ml-auto rounded-full bg-[var(--color-gold)] px-5 py-2.5 text-xs font-bold text-primary transition hover:brightness-105"
            >
              {t.welcomeBtn}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Report Flow Modal (location + form) ────────────────────── */
function ReportFlowModal({ onClose, onReported }: { onClose: () => void; onReported: () => void }) {
  const [step, setStep] = useState<"location" | "form">("location");
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);

  function handlePlaceSelected(p: Place) {
    setSelectedPlace(p);
    setStep("form");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex h-[560px] w-full max-w-sm flex-col overflow-hidden rounded-[2rem] border border-border bg-card shadow-[var(--shadow-hero)]"
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
  const [query, setQuery] = useState("");
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const { results, loading } = usePhotonSearch(query);
  const [open, setOpen] = useState(false);

  async function detectLocation() {
    if (!navigator.geolocation) { setGeoError("Geolocation not supported."); return; }
    setGeoLoading(true); setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const place = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        setGeoLoading(false);
        if (!place) { setGeoError("Couldn't resolve your location."); return; }
        onSelect(place);
      },
      (err) => { setGeoLoading(false); setGeoError(err.message || "Location permission denied."); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Fixed header */}
      <div className="shrink-0 border-b border-border/60 px-6 py-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-accent">Step 1 of 2</p>
            <h2 className="font-display mt-0.5 text-xl font-bold text-primary">Where are you?</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Search your locality to start reporting</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-muted-foreground hover:text-foreground">✕</button>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="no-scrollbar flex-1 overflow-y-auto px-6 py-5">
        <div className="space-y-3">
          <div className="relative">
            <input
              type="text"
              value={query}
              onFocus={() => setOpen(true)}
              onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
              placeholder="Search your place (e.g. Payyannur, Kakkanad…)"
              className="w-full rounded-2xl border border-border bg-background py-3 pl-4 pr-4 text-sm text-primary placeholder:text-primary/40 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
            {open && query.trim().length >= 2 && (
              <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
                {loading && <div className="px-4 py-2 text-xs text-muted-foreground">Searching…</div>}
                {!loading && results.length === 0 && <div className="px-4 py-2 text-xs text-muted-foreground">No places found in Kerala</div>}
                {results.map((p, i) => (
                  <button
                    key={`${p.lat}-${p.lon}-${i}`}
                    type="button"
                    onClick={() => { onSelect(p); setOpen(false); }}
                    className="w-full border-b border-border/50 px-4 py-3 text-left transition last:border-0 hover:bg-secondary"
                  >
                    <div className="text-sm font-bold text-primary">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.district} · {p.context}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={detectLocation}
            disabled={geoLoading}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--color-gold)]/30 bg-[var(--color-gold)]/10 py-3 text-sm font-bold text-primary transition hover:bg-[var(--color-gold)]/20 disabled:opacity-50"
          >
            📍 {geoLoading ? "Detecting…" : "Use my current location"}
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
  const [category, setCategory] = useState("Flood");
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
    if (!trimmed) { setError("Please describe what happened."); return; }
    if (imageFile && imageFile.size > 5 * 1024 * 1024) { setError("Image must be under 5 MB."); return; }
    setSubmitting(true); setError(null);
    try {
      const res = await fetch(`${API_BASE}/districts/${place.slug}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reporter_name: "Anonymous",
          content: trimmed,
          severity,
          category,
          location_attached: true,
          latitude: place.lat,
          longitude: place.lon,
          locality: place.name,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError((err as { detail?: string }).detail || "Submission failed.");
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
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex h-full flex-col">
      {/* Fixed header */}
      <div className="shrink-0 border-b border-border/60 px-6 py-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-accent">Step 2 of 2</p>
            <h2 className="font-display mt-0.5 text-xl font-bold text-primary">{place.name}</h2>
            <p className="text-xs text-muted-foreground">{place.district} · {place.context}</p>
          </div>
          <button type="button" onClick={onBack} className="text-xs font-bold text-accent hover:underline">← Back</button>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="no-scrollbar flex-1 space-y-4 overflow-y-auto px-6 py-5">
        {/* Category */}
        <div className="no-scrollbar -mx-6 flex gap-2 overflow-x-auto px-6 pb-1">
          {Object.entries(CATEGORY_META).map(([k, v]) => (
            <button
              key={k}
              type="button"
              onClick={() => setCategory(k)}
              className={`shrink-0 flex flex-col items-center gap-1 rounded-2xl border px-3 py-2 transition ${
                category === k
                  ? "border-[var(--color-gold)]/60 bg-[var(--color-gold)]/15 text-primary"
                  : "border-primary/10 bg-primary/5 text-primary/70"
              }`}
            >
              <span className="text-lg leading-none">{v.emoji}</span>
              <span className="text-[9px] font-bold uppercase tracking-wider">{v.label}</span>
            </button>
          ))}
        </div>

        {/* Severity */}
        <div className="grid grid-cols-3 gap-2">
          {(["safe", "warn", "critical"] as Severity[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSeverity(s)}
              className={`rounded-2xl border py-2.5 text-xs font-bold uppercase tracking-widest transition ${
                severity === s
                  ? s === "critical"
                    ? "border-destructive bg-destructive/10 text-destructive"
                    : s === "warn"
                    ? "border-warn bg-warn/10 text-warn"
                    : "border-success bg-success/10 text-success"
                  : "border-border text-muted-foreground hover:border-foreground/30"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Message */}
        <div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            maxLength={500}
            placeholder={t.describePlaceholder}
            className="w-full resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm text-primary placeholder:text-primary/40 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
          <div className="mt-1 flex justify-between text-xs text-muted-foreground">
            <span className={error ? "font-semibold text-destructive" : ""}>{error ?? t.visiblePublicly}</span>
            <span>{message.length}/500</span>
          </div>
        </div>

        {/* Photo */}
        {imagePreview ? (
          <div className="relative">
            <img src={imagePreview} alt="" className="w-full max-h-40 rounded-2xl border border-border object-cover" />
            <button type="button" onClick={() => pickImage(null)} className="absolute right-2 top-2 rounded-full border border-border bg-card px-2 py-1 text-[10px] font-bold">
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

      {/* Fixed footer with action buttons */}
      <div className="shrink-0 border-t border-border/60 px-6 py-4">
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 rounded-2xl border border-border py-3 text-sm font-semibold text-primary transition hover:bg-secondary">
            {t.cancel}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 rounded-2xl bg-[var(--color-gold)] py-3 text-sm font-bold text-primary transition hover:brightness-105 disabled:opacity-50"
          >
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex h-[600px] w-full max-w-md flex-col overflow-hidden rounded-[2rem] border border-border bg-card shadow-[var(--shadow-hero)]"
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

  return (
    <div className="flex h-full flex-col">
      {/* Sticky header */}
      <div className="shrink-0 border-b border-border/60 px-5 py-3.5">
        <div className="flex items-center justify-between">
          <button type="button" onClick={onBack} className="text-xs font-bold text-accent hover:underline">← {t.backToList}</button>
          <div className="flex items-center gap-2">
            <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${sevBadge(report.severity)}`}>{report.severity}</span>
            <span className="rounded-lg bg-secondary px-2.5 py-1 text-[10px] font-bold text-primary">{cat.emoji} {cat.label}</span>
          </div>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="no-scrollbar flex-1 overflow-y-auto">
        {/* Location + message */}
        <div className="border-b border-border/60 px-5 py-4">
          <p className="text-xs font-semibold text-accent">
            📍 {report.place ? `${report.place}, ` : ""}{report.district} · {formatReportTime(report.created_at)}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-primary">{report.message}</p>
          {imgUrl && <img src={imgUrl} alt="" className="mt-3 w-full max-h-36 rounded-2xl border border-border object-cover" />}
        </div>

        {/* Votes */}
        <div className="border-b border-border/60 px-5 py-4">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t.communityVotesLabel}</p>
          {loading ? (
            <p className="animate-pulse text-xs text-muted-foreground">{t.loadingDetail}</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {[
                { kind: "confirm" as const, label: t.confirm, count: localCounts?.confirmed ?? 0, active: "border-success bg-success/10 text-success", base: "border-success/20 text-success hover:bg-success/10" },
                { kind: "incorrect" as const, label: t.incorrect, count: localCounts?.incorrect ?? 0, active: "border-destructive bg-destructive/10 text-destructive", base: "border-destructive/20 text-destructive hover:bg-destructive/10" },
                { kind: "resolved" as const, label: t.resolvedV, count: localCounts?.resolved ?? 0, active: "border-foreground/30 bg-secondary text-foreground", base: "border-border text-muted-foreground hover:bg-secondary" },
              ].map(({ kind, label, count, active, base }) => (
                <button
                  key={kind}
                  type="button"
                  disabled={!!voted}
                  onClick={() => vote(kind)}
                  className={`rounded-2xl border py-3 text-[10px] font-bold uppercase tracking-wider transition disabled:cursor-default ${
                    voted === kind ? active : voted ? "border-border text-muted-foreground/30" : base
                  }`}
                >
                  <span className="block text-2xl font-extrabold tabular-nums leading-none">{count}</span>
                  <span className="mt-0.5 block text-[9px]">{label}{voted === kind && " ✓"}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Comments */}
        <div className="px-5 py-4">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t.discussionHd.replace("💬 ", "")}</p>
          {comments.length === 0 ? (
            <p className="text-xs italic text-muted-foreground">{t.noCommentsYet}</p>
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

      {/* Pinned comment form */}
      <div className="shrink-0 border-t border-border/60 bg-card px-5 py-3">
        <form onSubmit={submitComment} className="flex items-center gap-2">
          <input
            type="text"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder={t.commentPlaceholder}
            className="flex-1 rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-primary placeholder:text-primary/40 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
          <button
            type="submit"
            disabled={posting || !commentText.trim()}
            className="shrink-0 rounded-2xl bg-[var(--color-gold)] px-4 py-2.5 text-xs font-bold text-primary transition hover:brightness-105 disabled:opacity-40"
          >
            {posting ? "…" : t.postComment}
          </button>
        </form>
      </div>
    </div>
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
  const headline = alerts.find((a) => a.severity === "critical")?.disasterType ?? alerts[0]?.disasterType ?? (reports.length > 0 ? "Community reports active" : "No active incidents");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 backdrop-blur-sm p-3 sm:items-center sm:p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-[2rem] border border-primary/10 bg-card shadow-[var(--shadow-hero)]"
        style={{ maxHeight: "88vh" }}
      >
        {/* Severity strip */}
        <div className={`h-1.5 w-full shrink-0 ${sev === "critical" ? "bg-destructive" : sev === "warn" ? "bg-warn" : "bg-success"}`} />

        {/* Header */}
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto divide-y divide-border">
          {/* Official alerts */}
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

          {/* Reports */}
          <section className="px-5 py-4">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t.crowdBriefs} ({visibleReports.length})</p>
            {places.length > 0 && (
              <div className="no-scrollbar -mx-5 flex gap-1.5 overflow-x-auto px-5 pb-2">
                <button
                  type="button"
                  onClick={() => setActivePlace(null)}
                  className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition ${activePlace === null ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-primary"}`}
                >
                  {t.allPlaces}
                </button>
                {places.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setActivePlace(p)}
                    className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition ${activePlace === p ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-primary"}`}
                  >
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
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedReport(r)}
                    className="flex w-full items-start gap-3 rounded-2xl border border-primary/8 bg-background p-3 text-left transition hover:bg-secondary"
                  >
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
