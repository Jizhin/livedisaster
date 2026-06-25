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

/* ─── District constants ─────────────────────────────────────── */

const DISTRICTS: District[] = [
  { code: "KL-01", name: "Trivandrum",     slug: "trivandrum",     lat: 8.5241,  lon: 76.9366 },
  { code: "KL-02", name: "Kollam",          slug: "kollam",          lat: 8.8932,  lon: 76.6141 },
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

function formatAlertWindow(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" });
}

const severityColor = (s: Severity) =>
  s === "critical" ? "bg-critical" : s === "warn" ? "bg-warn" : "bg-primary";
const severityText = (s: Severity) =>
  s === "critical" ? "text-critical" : s === "warn" ? "text-warn" : "text-primary";
const severityBorder = (s: Severity) =>
  s === "critical" ? "border-critical" : s === "warn" ? "border-warn" : "border-primary";

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

function useLiveReports(limit = 40) {
  const [reports, setReports] = useState<Report[]>([]);
  const [status, setStatus] = useState<"connecting" | "live" | "offline">("connecting");
  const [flashId, setFlashId] = useState<string | null>(null);
  const prevIdsRef = useRef<Set<string>>(new Set());

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
  }, [limit]);

  return { reports, status, flashId };
}

function useKeralaAlerts() {
  const [alerts, setAlerts] = useState<OfficialAlert[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    const load = () => {
      fetch(`${API_BASE}/ndma-alerts`)
        .then((r) => r.json())
        .then((data: OfficialAlert[]) => {
          if (!active) return;
          setAlerts(data);
          setStatus("ready");
        })
        .catch((err) => {
          console.error("[alerts]", err);
          if (active) setStatus("error");
        });
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

/* ─── Main page ─────────────────────────────────────────────── */

export function HomePage() {
  const { lang, t, toggle } = useLanguage();
  const time = useLocalTime();
  const { reports, status, flashId } = useLiveReports(40);
  const { alerts, status: alertStatus } = useKeralaAlerts();
  const tickerItems = useMemo(() => {
    if (alerts.length === 0) return [];
    return [...alerts, ...alerts];
  }, [alerts]);
  const topAlert = alerts[0] ?? null;

  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [districtFocus, setDistrictFocus] = useState<string | null>(null);

  const alreadySeen = typeof sessionStorage !== "undefined" && sessionStorage.getItem("kl_welcomed");
  const [welcomeOpen, setWelcomeOpen] = useState(!alreadySeen);
  const dataReady = status === "live" && alertStatus !== "loading";

  return (
    <div className="min-h-screen w-full bg-background text-foreground p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <header className="flex justify-between items-end border-b border-surface pb-6 gap-4">
          <div className="space-y-1">
            <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-extrabold uppercase leading-none">
              {t.mainTitle}
            </h1>
            <p className="font-display text-primary text-xs sm:text-sm uppercase tracking-widest font-bold">
              {t.keralaDisasterWatch}
            </p>
          </div>
          <div className="flex items-end gap-3">
            <div className="hidden md:block text-right">
              <div className="font-display text-[10px] uppercase tracking-widest text-muted-foreground">{t.localTime}</div>
              <div className="font-display text-base font-bold tabular-nums">{time || "—"}</div>
            </div>
            <button
              type="button"
              onClick={toggle}
              className="font-display text-xs uppercase tracking-widest font-bold px-3 py-2 border border-surface hover:border-primary transition-colors"
            >
              {lang === "en" ? "ML" : "EN"}
            </button>
          </div>
        </header>

        {/* Official Alerts Ticker */}
        <div className="bg-surface border-y border-primary/20 overflow-hidden py-3">
          {tickerItems.length === 0 ? (
            <div className="font-display text-xs uppercase font-bold tracking-wider text-muted-foreground px-4">
              {alertStatus === "loading"
                ? t.fetchingAdvisories
                : alertStatus === "error"
                  ? t.advisoryFeedUnavail
                  : t.noActiveAdvisories}
            </div>
          ) : (
            <div className="flex whitespace-nowrap gap-8 font-display text-xs uppercase font-bold tracking-wider animate-ticker w-max">
              {tickerItems.map((a, i) => (
                <span key={`${a.id}-${i}`} className="flex items-center gap-2">
                  <span className={severityText(a.severity)}>●</span>
                  <span className="text-foreground">{a.district ?? "Kerala"}:</span>
                  <span className="text-muted-foreground">{a.disasterType} · {a.source}</span>
                  <span className="text-muted-foreground/40 ml-4">|</span>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Left: Featured alert + Report action */}
          <div className="lg:col-span-8 space-y-6">

            {topAlert ? (
              <article className={`relative border-l-4 p-6 ${
                topAlert.severity === "critical" ? "bg-critical/10 border-critical"
                  : topAlert.severity === "warn" ? "bg-warn/10 border-warn"
                  : "bg-primary/10 border-primary"
              }`}>
                <div className="flex justify-between items-start mb-4 gap-4 flex-wrap">
                  <span className={`font-display px-3 py-1 text-xs font-bold uppercase tracking-widest ${
                    topAlert.severity === "critical" ? "bg-critical text-critical-foreground"
                      : topAlert.severity === "warn" ? "bg-warn text-background"
                      : "bg-primary text-background"
                  }`}>
                    {topAlert.severityLabel} · {topAlert.source}
                  </span>
                  <span className="text-xs text-muted-foreground font-display">
                    {formatAlertWindow(topAlert.effectiveStart)}
                  </span>
                </div>
                <h2 className="font-display text-2xl md:text-3xl font-bold mb-3 leading-tight">
                  {topAlert.district ?? "Kerala"}: {topAlert.disasterType}
                </h2>
                <p className="text-base md:text-lg text-foreground/80 mb-4">
                  {topAlert.message || topAlert.areaDescription}
                </p>
                <div className="font-display text-[10px] uppercase tracking-widest text-muted-foreground">
                  Area: {topAlert.areaDescription}
                </div>
              </article>
            ) : (
              <article className="relative bg-surface border-l-4 border-primary/40 p-6">
                <div className="font-display text-[10px] uppercase tracking-widest text-primary font-bold mb-2">{t.allClearFeed}</div>
                <h2 className="font-display text-2xl md:text-3xl font-bold mb-3 leading-tight">
                  {t.noActiveSachet}
                </h2>
                <p className="text-base text-foreground/70">
                  {t.crowdSourcedNote}
                </p>
              </article>
            )}

            <div className="bg-surface p-6 space-y-5">
              <div>
                <label className="font-display block text-[10px] uppercase tracking-widest text-muted-foreground mb-3 font-bold">
                  {t.step1Location}
                </label>
                <LocationPicker selected={selectedPlace} onSelect={setSelectedPlace} />
              </div>
              <button
                type="button"
                disabled={!selectedPlace}
                onClick={() => setReportOpen(true)}
                className="w-full flex flex-col items-start p-6 bg-background border border-warn/30 enabled:hover:border-warn transition-all text-left group disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <div className="flex items-center justify-between w-full mb-4">
                  <div className="w-10 h-10 rounded-full bg-warn/20 flex items-center justify-center group-enabled:group-hover:scale-110 transition-transform">
                    <div className="w-4 h-4 bg-warn rotate-45" />
                  </div>
                  <span className="font-display text-[10px] uppercase tracking-widest text-muted-foreground">{t.step2Label}</span>
                </div>
                <span className="font-display text-xl font-bold mb-1 uppercase tracking-tight">{t.reportAlertLabel}</span>
                <span className="text-sm text-muted-foreground">
                  {selectedPlace
                    ? `${t.submitForLocation} ${selectedPlace.name}, ${selectedPlace.district}.`
                    : t.searchLocHint}
                </span>
              </button>
            </div>
          </div>

          {/* Right: Stats + Live Feed */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-surface p-6">
              <h3 className="font-display text-xs font-bold uppercase tracking-widest text-muted-foreground mb-6">{t.keralaOverview}</h3>
              <div className="grid grid-cols-2 gap-6">
                <Stat value={String(alerts.filter((a) => a.severity !== "safe").length)} label={t.officialAlerts} tone="warn" />
                <Stat value={String(reports.length)} label={t.crowdReports} tone="primary" />
                <Stat
                  value={String(new Set([
                    ...alerts.map((a) => a.district).filter(Boolean),
                    ...reports.map((r) => r.district),
                  ]).size)}
                  label={t.districtsActive}
                  tone="warn"
                />
                <Stat
                  value={String(new Set([
                    ...alerts.filter((a) => a.severity === "critical").map((a) => a.district),
                    ...reports.filter((r) => r.severity === "critical").map((r) => r.district),
                  ].filter(Boolean)).size)}
                  label={t.criticalZones}
                  tone="muted"
                />
              </div>
            </div>

            <div className="bg-surface flex flex-col h-[400px]">
              <div className="p-4 border-b border-background/40 flex justify-between items-center gap-2">
                <h3 className="font-display text-xs font-bold uppercase tracking-widest">{t.liveReports}</h3>
                <div className="flex items-center gap-2 font-display text-[10px] uppercase tracking-widest text-muted-foreground">
                  <span>{status === "live" ? t.statusLive : status === "connecting" ? t.statusConnecting : t.statusOffline}</span>
                  <span className={`w-2 h-2 rounded-full ${
                    status === "live" ? "bg-primary animate-pulse"
                      : status === "connecting" ? "bg-warn animate-pulse"
                      : "bg-critical"
                  }`} />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {reports.length === 0 && status !== "connecting" && (
                  <div className="text-center py-8 text-muted-foreground/60 italic text-xs">{t.noRecentAlerts}</div>
                )}
                {reports.slice(0, 20).map((r) => (
                  <FeedRow key={r.id} report={r} flash={flashId === r.id} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* District Grid */}
        <section className="space-y-4 pt-8 border-t border-surface">
          <h3 className="font-display text-xs font-bold uppercase tracking-widest text-muted-foreground">
            {t.allDistricts} · {t.tapToInspect}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-px bg-surface border border-surface">
            {DISTRICTS.map((d) => {
              const dReports = reports.filter((r) => r.district === d.name);
              const dAlerts = alerts.filter((a) => a.district === d.name);
              const total = dReports.length + dAlerts.length;
              const sev: Severity = maxSeverity([
                ...dReports.map((r) => ({ severity: r.severity })),
                ...dAlerts.map((a) => ({ severity: a.severity })),
              ]);
              const load = total === 0 ? 0 : Math.min(1, total / 8);
              return (
                <button
                  key={d.code}
                  type="button"
                  onClick={() => setDistrictFocus(d.name)}
                  className="bg-background p-4 hover:bg-surface transition-colors text-left"
                >
                  <div className="font-display text-[10px] uppercase text-muted-foreground mb-2 font-bold flex justify-between">
                    <span>{d.code}</span>
                    {total > 0 && <span className={severityText(sev)}>{total}</span>}
                  </div>
                  <div className="font-display text-sm font-bold uppercase tracking-tight">{d.name}</div>
                  <div className="mt-4 h-1 w-full bg-foreground/5 rounded-full overflow-hidden">
                    {total > 0 && (
                      <div
                        className={`h-full ${severityColor(sev)} ${sev === "critical" ? "animate-pulse" : ""}`}
                        style={{ width: `${Math.max(8, load * 100)}%` }}
                      />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <footer className="pt-8 pb-4 text-center font-display text-[10px] uppercase tracking-widest text-muted-foreground/60">
          {t.communityPowered}
        </footer>
      </div>

      {welcomeOpen && (
        <WelcomeModal
          dataReady={dataReady}
          lang={lang}
          t={t}
          onDismiss={() => {
            setWelcomeOpen(false);
            sessionStorage.setItem("kl_welcomed", "1");
          }}
        />
      )}

      {reportOpen && selectedPlace && (
        <ReportAlertModal
          place={selectedPlace}
          onClose={() => setReportOpen(false)}
          onSubmitted={() => setReportOpen(false)}
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
    </div>
  );
}

/* ─── Welcome Modal ─────────────────────────────────────────── */

type TShape = typeof import("../i18n/translations").T["en"];

function WelcomeModal({
  dataReady,
  lang,
  t,
  onDismiss,
}: {
  dataReady: boolean;
  lang: string;
  t: TShape;
  onDismiss: () => void;
}) {
  const steps = [
    { icon: "📍", title: t.welcomeStep1Title, desc: t.welcomeStep1Desc },
    { icon: "⚠️", title: t.welcomeStep2Title, desc: t.welcomeStep2Desc },
    { icon: "🗺️", title: t.welcomeStep3Title, desc: t.welcomeStep3Desc },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/90 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-surface border border-primary/30 flex flex-col overflow-hidden">
        {/* Title bar */}
        <div className={`h-1 w-full transition-all duration-700 ${dataReady ? "bg-primary" : "bg-warn/60 animate-pulse"}`} />
        <div className="p-6 space-y-5">
          <div className="space-y-1">
            <div className="font-display text-[10px] uppercase tracking-[0.3em] text-primary font-bold">
              {t.welcomeTag}
            </div>
            <h2 className="font-display text-2xl font-extrabold uppercase leading-tight">
              {t.welcomeHeadline}
            </h2>
            <p className="text-sm text-foreground/70">{t.welcomeSub}</p>
          </div>

          <div className="space-y-3">
            {steps.map((s, i) => (
              <div key={i} className="flex items-start gap-3 bg-background/60 px-4 py-3">
                <span className="text-xl shrink-0 mt-0.5">{s.icon}</span>
                <div>
                  <div className="font-display text-xs font-bold uppercase tracking-widest mb-0.5">{s.title}</div>
                  <div className="text-xs text-foreground/60">{s.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Loading / ready state */}
          <div className="flex items-center gap-3">
            {dataReady ? (
              <span className="font-display text-[10px] uppercase tracking-widest text-primary font-bold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-primary" /> {t.welcomeReady}
              </span>
            ) : (
              <span className="font-display text-[10px] uppercase tracking-widest text-warn/80 flex items-center gap-1.5 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-warn" /> {t.welcomeLoading}
              </span>
            )}
            <button
              type="button"
              onClick={onDismiss}
              className="ml-auto font-display text-xs uppercase tracking-widest font-bold px-5 py-2.5 bg-primary text-background hover:bg-primary/90 transition-colors"
            >
              {t.welcomeBtn}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Location Picker ───────────────────────────────────────── */

function LocationPicker({
  selected,
  onSelect,
}: {
  selected: Place | null;
  onSelect: (p: Place | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const { results, loading } = usePhotonSearch(query);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function detectLocation() {
    if (!navigator.geolocation) { setGeoError("Geolocation not supported."); return; }
    setGeoLoading(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const place = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        setGeoLoading(false);
        if (!place) { setGeoError("Couldn't resolve your location."); return; }
        onSelect(place);
        setQuery(place.name);
      },
      (err) => { setGeoLoading(false); setGeoError(err.message || "Location permission denied."); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div ref={boxRef} className="relative space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (selected) onSelect(null);
          }}
          placeholder="Search your place (e.g. Payyannur, Kakkanad...)"
          className="flex-1 bg-background border border-surface focus:border-primary px-4 py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/60"
        />
        <button
          type="button"
          onClick={detectLocation}
          disabled={geoLoading}
          className="font-display text-[10px] uppercase tracking-widest font-bold px-3 py-3 bg-background border border-primary/40 hover:border-primary text-primary disabled:opacity-50"
        >
          {geoLoading ? "..." : "📍 Auto"}
        </button>
      </div>

      {selected && (
        <div className="flex items-center justify-between bg-primary/10 border border-primary/30 px-3 py-2">
          <div>
            <div className="font-display text-sm font-bold">{selected.name}</div>
            <div className="font-display text-[10px] uppercase tracking-widest text-muted-foreground">
              {selected.district} District · {selected.context}
            </div>
          </div>
          <button
            type="button"
            onClick={() => { onSelect(null); setQuery(""); }}
            className="font-display text-[10px] uppercase text-muted-foreground hover:text-foreground"
          >
            Clear ✕
          </button>
        </div>
      )}

      {geoError && (
        <div className="font-display text-[10px] uppercase tracking-widest text-critical">{geoError}</div>
      )}

      {open && !selected && (query.trim().length >= 2 || loading) && (
        <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-background border border-surface max-h-72 overflow-y-auto shadow-xl">
          {loading && (
            <div className="px-3 py-2 font-display text-[10px] uppercase tracking-widest text-muted-foreground">Searching...</div>
          )}
          {!loading && results.length === 0 && (
            <div className="px-3 py-2 font-display text-[10px] uppercase tracking-widest text-muted-foreground">No places found in Kerala</div>
          )}
          {results.map((p, i) => (
            <button
              key={`${p.lat}-${p.lon}-${i}`}
              type="button"
              onClick={() => { onSelect(p); setQuery(p.name); setOpen(false); }}
              className="w-full text-left px-3 py-2 hover:bg-surface border-b border-surface/60 last:border-0"
            >
              <div className="text-sm font-semibold">{p.name}</div>
              <div className="font-display text-[10px] uppercase tracking-widest text-muted-foreground">
                {p.district} · {p.context}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Report Alert Modal ────────────────────────────────────── */

function ReportAlertModal({
  place,
  onClose,
  onSubmitted,
}: {
  place: Place;
  onClose: () => void;
  onSubmitted: () => void;
}) {
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
    if (trimmed.length < 1 || trimmed.length > 500) { setError("Message must be 1–500 characters."); return; }
    if (imageFile && imageFile.size > 5 * 1024 * 1024) { setError("Image must be under 5 MB."); return; }
    setSubmitting(true);
    setError(null);

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
        setError((err as { detail?: string }).detail || "Submission failed. Please try again.");
        setSubmitting(false);
        return;
      }

      const created = await res.json() as { id: number };

      if (imageFile) {
        const formData = new FormData();
        formData.append("file", imageFile);
        await fetch(`${API_BASE}/reports/${created.id}/images`, { method: "POST", body: formData });
      }

      onSubmitted();
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-lg bg-surface border border-warn/40 p-6 space-y-5 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="font-display text-[10px] uppercase tracking-widest text-warn font-bold mb-1">{t.newReportTag}</div>
            <h2 className="font-display text-xl font-bold uppercase tracking-tight">{place.name}</h2>
            <div className="font-display text-[10px] uppercase tracking-widest text-muted-foreground mt-1">
              {place.district} District · {place.context}
            </div>
          </div>
          <button type="button" onClick={onClose} className="font-display text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground">
            {t.close} ✕
          </button>
        </div>

        <label className="block space-y-2">
          <span className="font-display block text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{t.categoryLabel}</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full bg-background border border-surface focus:border-primary px-3 py-2 text-sm outline-none"
          >
            {["Flood", "Landslide", "Road Damage", "Power Outage", "Medical Emergency", "Fire", "Other"].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>

        <div className="space-y-2">
          <span className="font-display block text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{t.severityTagLabel}</span>
          <div className="grid grid-cols-3 gap-2">
            {(["safe", "warn", "critical"] as Severity[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSeverity(s)}
                className={`font-display text-xs uppercase tracking-widest font-bold py-2 border transition-colors ${
                  severity === s
                    ? s === "critical" ? "border-critical bg-critical/20 text-critical"
                      : s === "warn" ? "border-warn bg-warn/20 text-warn"
                      : "border-primary bg-primary/20 text-primary"
                    : "border-surface text-muted-foreground hover:border-foreground/40"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <label className="block space-y-2">
          <span className="font-display block text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{t.whatHappened}</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            maxLength={500}
            placeholder={t.describePlaceholder}
            className="w-full bg-background border border-surface focus:border-primary px-3 py-2 text-sm outline-none resize-none placeholder:text-muted-foreground/60"
          />
          <div className="flex justify-between text-[10px] font-display uppercase tracking-widest text-muted-foreground">
            <span className={error ? "text-critical" : ""}>{error ?? t.visiblePublicly}</span>
            <span>{message.length}/500</span>
          </div>
        </label>

        <div className="space-y-2">
          <span className="font-display block text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{t.photoOptionalLabel}</span>
          {imagePreview ? (
            <div className="relative">
              <img src={imagePreview} alt="preview" className="w-full max-h-56 object-cover border border-surface" />
              <button
                type="button"
                onClick={() => pickImage(null)}
                className="absolute top-2 right-2 font-display text-[10px] uppercase tracking-widest font-bold px-2 py-1 bg-background/80 border border-surface hover:border-critical"
              >
                {t.removePhoto}
              </button>
            </div>
          ) : (
            <label className="flex items-center justify-center w-full border border-dashed border-surface hover:border-primary py-6 cursor-pointer text-center">
              <input type="file" accept="image/*" className="hidden" onChange={(e) => pickImage(e.target.files?.[0] ?? null)} />
              <span className="font-display text-[10px] uppercase tracking-widest text-muted-foreground">{t.attachPhotoBtn}</span>
            </label>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="font-display text-xs uppercase tracking-widest px-4 py-2 border border-surface hover:border-foreground/40">
            {t.cancel}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="font-display text-xs uppercase tracking-widest font-bold px-4 py-2 bg-warn text-background hover:bg-warn/90 disabled:opacity-50"
          >
            {submitting ? t.submitting : t.submitReportBtn}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ─── District Dossier Modal ────────────────────────────────── */

function DistrictModal({
  district,
  reports,
  alerts,
  onClose,
}: {
  district: string;
  reports: Report[];
  alerts: OfficialAlert[];
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const places = useMemo(() => {
    const set = new Set<string>();
    reports.forEach((r) => r.place && set.add(r.place));
    return Array.from(set);
  }, [reports]);
  const [activePlace, setActivePlace] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const visibleReports = activePlace ? reports.filter((r) => r.place === activePlace) : reports;

  const sev = maxSeverity([
    ...reports.map((r) => ({ severity: r.severity })),
    ...alerts.map((a) => ({ severity: a.severity })),
  ]);
  const headline =
    alerts.find((a) => a.severity === "critical")?.disasterType ??
    alerts[0]?.disasterType ??
    (reports.length > 0 ? "Crowd reports active" : "No active incidents");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-5xl bg-background border border-surface max-h-[92vh] flex flex-col overflow-hidden"
      >
        <header className={`relative border-b-4 ${severityBorder(sev)} bg-surface p-6`}>
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="font-display text-[10px] uppercase tracking-[0.3em] text-muted-foreground font-bold">
              {t.dossierLabel}
            </div>
            <button type="button" onClick={onClose} className="font-display text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground">
              {t.close} ✕
            </button>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-3xl md:text-5xl font-extrabold uppercase tracking-tight leading-none">{district}</h2>
              <div className="font-display text-sm md:text-base text-foreground/80 mt-2">{headline}</div>
            </div>
            <div className="flex gap-6">
              <DossierMetric value={alerts.length} label={t.officialLabel} tone={sev} />
              <DossierMetric value={reports.length} label={t.crowdLabel} tone="primary" />
              <DossierMetric value={places.length} label={t.placesMetricLabel} tone="muted" />
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <section className="border-b border-surface">
            <div className="px-6 pt-5 pb-3 flex items-center justify-between">
              <h3 className="font-display text-xs font-bold uppercase tracking-widest text-muted-foreground">{t.officialAdvisories}</h3>
              <span className="font-display text-[10px] uppercase tracking-widest text-muted-foreground/70">NDMA Sachet · IMD · KSDMA</span>
            </div>
            {alerts.length === 0 ? (
              <div className="px-6 pb-6 text-sm text-muted-foreground/70 italic">{t.noOfficialAdvisory} {district}.</div>
            ) : (
              <div className="px-6 pb-6 grid grid-cols-1 md:grid-cols-2 gap-3">
                {alerts.map((a) => <OfficialAlertCard key={a.id} alert={a} />)}
              </div>
            )}
          </section>

          <section>
            <div className="px-6 pt-5 pb-3">
              <h3 className="font-display text-xs font-bold uppercase tracking-widest text-muted-foreground">
                {t.crowdBriefs} ({visibleReports.length})
              </h3>
            </div>
            {places.length > 0 && (
              <div className="flex gap-2 overflow-x-auto px-6 pb-3">
                <button
                  type="button"
                  onClick={() => setActivePlace(null)}
                  className={`shrink-0 font-display text-[10px] uppercase tracking-widest font-bold px-3 py-1.5 border transition-colors ${
                    activePlace === null ? "border-primary bg-primary/20 text-primary" : "border-surface text-muted-foreground hover:border-foreground/40"
                  }`}
                >
                  {t.allPlaces}
                </button>
                {places.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setActivePlace(p)}
                    className={`shrink-0 font-display text-[10px] uppercase tracking-widest font-bold px-3 py-1.5 border transition-colors ${
                      activePlace === p ? "border-primary bg-primary/20 text-primary" : "border-surface text-muted-foreground hover:border-foreground/40"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
            <div className="px-6 pb-6 space-y-3">
              {visibleReports.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground/60 italic text-xs font-display uppercase tracking-widest">
                  {t.noCrowdReportsYet}{activePlace ? ` ${t.forLabel} ${activePlace}` : ""}.
                </div>
              ) : (
                visibleReports.map((r) => (
                  <ReportCard key={r.id} report={r} onClick={() => setSelectedReport(r)} />
                ))
              )}
            </div>
          </section>
        </div>

        {selectedReport && (
          <ReportDetailPanel
            report={selectedReport}
            onBack={() => setSelectedReport(null)}
          />
        )}
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
  const [commentName, setCommentName] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (data) {
      setLocalCounts({
        confirmed: data.confirmed_count ?? 0,
        incorrect: data.incorrect_count ?? 0,
        resolved: data.resolved_count ?? 0,
      });
      setComments(data.comments ?? []);
    }
  }, [data]);

  async function vote(kind: "confirm" | "incorrect" | "resolved") {
    if (voted) return;
    setVoted(kind);
    if (localCounts) {
      setLocalCounts((c) => c ? ({ ...c, [kind === "confirm" ? "confirmed" : kind]: c[kind === "confirm" ? "confirmed" : kind as "incorrect" | "resolved"] + 1 }) : c);
    }
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
        body: JSON.stringify({ author_name: commentName.trim() || "Anonymous", content: text }),
      });
      if (res.ok) {
        // Backend returns ReportDetail (full report), not the comment —
        // build the comment from what we sent instead of parsing response
        const newComment: ApiComment = {
          id: Date.now(),
          author_name: commentName.trim() || "Anonymous",
          content: text,
          created_at: new Date().toISOString(),
        };
        setComments((prev) => [...prev, newComment]);
        setCommentText("");
      }
    } finally {
      setPosting(false);
    }
  }

  const imgUrl = data?.images?.[0]?.file_path
    ? `${UPLOADS_ORIGIN}/uploads/${data.images[0].file_path}`
    : report.image_url;

  return (
    <div className="absolute inset-0 bg-background z-10 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-2 border-b border-surface shrink-0">
        <button type="button" onClick={onBack}
          className="font-display text-[10px] uppercase tracking-widest text-primary hover:text-foreground">
          ← {t.backToList}
        </button>
        <span className="text-muted-foreground/30 text-xs">|</span>
        <span className={`font-display text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 ${
          report.severity === "critical" ? "bg-critical/20 text-critical"
            : report.severity === "warn" ? "bg-warn/20 text-warn"
            : "bg-primary/20 text-primary"
        }`}>{report.severity}</span>
        {report.category && (
          <span className="font-display text-[10px] uppercase tracking-widest text-muted-foreground">{report.category}</span>
        )}
        <span className="font-display text-[10px] uppercase tracking-widest text-muted-foreground ml-auto">
          {formatReportTime(report.created_at)}
        </span>
      </header>

      <div className="flex-1 overflow-y-auto divide-y divide-surface">
        {/* Location + message */}
        <div className="px-4 py-3 space-y-1.5">
          <div className="font-display text-[10px] uppercase tracking-widest text-muted-foreground">
            📍 {report.place ? `${report.place}, ` : ""}{report.district}
          </div>
          <p className="text-sm leading-snug">{report.message}</p>
          {imgUrl && (
            <img src={imgUrl} alt="" className="w-full max-h-40 object-cover border border-surface mt-2" />
          )}
        </div>

        {/* Vote buttons */}
        <div className="px-4 py-3">
          <div className="font-display text-[10px] uppercase tracking-widest text-foreground/70 font-bold mb-2">
            {t.communityVotesLabel}
          </div>
          {loading ? (
            <div className="font-display text-[10px] uppercase tracking-widest text-muted-foreground/50 animate-pulse">{t.loadingDetail}</div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {(["confirm", "incorrect", "resolved"] as const).map((kind) => {
                const label = kind === "confirm" ? t.confirm : kind === "incorrect" ? t.incorrect : t.resolvedV;
                const count = localCounts
                  ? kind === "confirm" ? localCounts.confirmed : kind === "incorrect" ? localCounts.incorrect : localCounts.resolved
                  : 0;
                const active = voted === kind;
                const colorClass = kind === "confirm"
                  ? "border-primary text-primary bg-primary/10"
                  : kind === "incorrect"
                  ? "border-warn text-warn bg-warn/10"
                  : "border-foreground/30 text-foreground/60 bg-foreground/5";
                return (
                  <button
                    key={kind}
                    type="button"
                    disabled={!!voted}
                    onClick={() => vote(kind)}
                    className={`font-display text-[10px] uppercase tracking-widest font-bold py-2 border transition-all disabled:cursor-default ${
                      active ? colorClass : voted ? "border-surface text-muted-foreground/40" : `border-surface text-muted-foreground hover:${colorClass}`
                    }`}
                  >
                    <span className="block text-base tabular-nums leading-none mb-0.5">{count}</span>
                    {label}
                    {active && " ✓"}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Comments */}
        <div className="px-4 py-3 space-y-2">
          <div className="font-display text-[10px] uppercase tracking-widest text-foreground/70 font-bold">
            {t.discussionHd}
          </div>
          {comments.length === 0 ? (
            <div className="font-display text-[10px] italic text-muted-foreground/50">{t.noCommentsYet}</div>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="bg-surface/60 px-3 py-2">
                <div className="font-display text-[9px] uppercase tracking-widest text-foreground/50 mb-1">
                  {c.author_name} · {formatReportTime(c.created_at)}
                </div>
                <p className="text-sm text-foreground leading-snug">{c.content}</p>
              </div>
            ))
          )}

          {/* Comment form */}
          <form onSubmit={submitComment} className="pt-2 space-y-1.5">
            <input
              type="text"
              value={commentName}
              onChange={(e) => setCommentName(e.target.value)}
              placeholder={t.namePlaceholder}
              className="w-full bg-background border border-surface focus:border-primary px-3 py-1.5 text-xs outline-none placeholder:text-muted-foreground/50"
            />
            <div className="flex gap-2">
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                rows={2}
                placeholder={t.commentPlaceholder}
                className="flex-1 bg-background border border-surface focus:border-primary px-3 py-1.5 text-xs outline-none resize-none placeholder:text-muted-foreground/50"
              />
              <button
                type="submit"
                disabled={posting || !commentText.trim()}
                className="font-display text-[10px] uppercase tracking-widest font-bold px-3 bg-primary/20 text-primary border border-primary/40 hover:bg-primary/30 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                {posting ? "…" : t.postComment}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ─── Small components ──────────────────────────────────────── */

function DossierMetric({ value, label, tone }: {
  value: number;
  label: string;
  tone: Severity | "primary" | "muted";
}) {
  const color =
    tone === "critical" ? "text-critical" : tone === "warn" ? "text-warn"
      : tone === "primary" ? "text-primary" : tone === "safe" ? "text-primary"
      : "text-foreground/50";
  return (
    <div className="text-right">
      <div className={`font-display text-3xl font-bold tabular-nums ${color}`}>{value}</div>
      <div className="font-display text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{label}</div>
    </div>
  );
}

function OfficialAlertCard({ alert }: { alert: OfficialAlert }) {
  return (
    <article className={`bg-surface border-l-4 ${severityBorder(alert.severity)} p-4 space-y-2`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={`font-display text-[10px] uppercase tracking-widest font-bold ${severityText(alert.severity)}`}>
            {alert.severityLabel} · {alert.disasterType}
          </div>
          <div className="font-display text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">{alert.source}</div>
        </div>
        <div className="font-display text-[10px] uppercase tracking-widest text-muted-foreground text-right shrink-0">
          {formatAlertWindow(alert.effectiveStart)}
          {alert.effectiveEnd ? ` → ${formatAlertWindow(alert.effectiveEnd)}` : ""}
        </div>
      </div>
      {alert.message && <p className="text-sm text-foreground/90">{alert.message}</p>}
      <div className="font-display text-[10px] uppercase tracking-widest text-muted-foreground/80">Area: {alert.areaDescription}</div>
    </article>
  );
}

function FeedRow({ report, flash }: { report: Report; flash: boolean }) {
  return (
    <div className={`border-l-2 pl-3 py-1 transition-colors ${severityBorder(report.severity)} ${flash ? "bg-warn/10" : ""}`}>
      <div className="font-display text-xs text-muted-foreground mb-1 flex items-center gap-2">
        {flash && (
          <span className="font-display text-[9px] uppercase tracking-widest font-bold bg-warn text-background px-1.5 py-0.5">New</span>
        )}
        <span>{report.place ? `${report.place}, ` : ""}{report.district}</span>
        <span>· {formatReportTime(report.created_at)}</span>
      </div>
      <div className="text-sm font-semibold">{report.message}</div>
      {report.image_url && (
        <img src={report.image_url} alt="" className="mt-2 w-full max-h-32 object-cover border border-surface" />
      )}
    </div>
  );
}

function ReportCard({ report, onClick }: { report: Report; onClick?: () => void }) {
  return (
    <article
      className={`bg-background border-l-4 ${severityBorder(report.severity)} p-4 ${onClick ? "cursor-pointer hover:bg-surface/50 transition-colors" : ""}`}
      onClick={onClick}
    >
      <div className="flex justify-between items-start gap-3 mb-2">
        <div>
          <div className="font-display text-[10px] uppercase tracking-widest text-muted-foreground">
            {report.place ?? report.district} · {report.category ?? "General"}
          </div>
          <div className={`font-display text-[10px] uppercase tracking-widest font-bold ${severityText(report.severity)}`}>
            {report.severity}
          </div>
        </div>
        <span className="font-display text-[10px] uppercase tracking-widest text-muted-foreground">
          {formatReportTime(report.created_at)}
        </span>
      </div>
      <p className="text-sm">{report.message}</p>
      {report.image_url && (
        <img src={report.image_url} alt="" className="mt-3 w-full max-h-64 object-cover border border-surface" />
      )}
      {onClick && (
        <div className="mt-2 font-display text-[9px] uppercase tracking-widest text-primary/60">
          → tap for details
        </div>
      )}
    </article>
  );
}

function Stat({ value, label, tone }: {
  value: string;
  label: string;
  tone: "warn" | "primary" | "muted";
}) {
  const color = tone === "warn" ? "text-warn" : tone === "primary" ? "text-primary" : "text-foreground/40";
  return (
    <div className="space-y-1">
      <div className={`font-display text-3xl font-bold tabular-nums ${color}`}>{value}</div>
      <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{label}</div>
    </div>
  );
}
