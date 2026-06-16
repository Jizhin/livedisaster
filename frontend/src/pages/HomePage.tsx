import {
  ArrowRight, BadgeCheck, Check, CheckCircle, ChevronDown,
  Clock, Eye, MapPin, MessageSquare, RefreshCw,
  Search, Share2, ShieldCheck, TriangleAlert,
  X, XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, imageUrl } from "../api/client";
import { ReportDetailModal } from "../components/ReportDetailModal";
import { useLanguage } from "../i18n/LanguageContext";
import type { District, Report, StatsResult } from "../types";
import { timeAgo } from "../utils/time";

/* ── Modal types ────────────────────────────────────────────── */
const MODAL_TYPES = [
  { key: "flood",     emoji: "🌊", label: "Flooding",     prefix: "Flood"      },
  { key: "roaddmg",  emoji: "🛣️", label: "Road Damage",  prefix: "Road Block" },
  { key: "treefall", emoji: "🌳", label: "Fallen Tree",  prefix: "Other"      },
  { key: "weather",  emoji: "⛈️", label: "Weather",      prefix: "Other"      },
  { key: "powerout", emoji: "⚡", label: "Power Outage", prefix: "Power Cut"  },
  { key: "traffic",  emoji: "🚧", label: "Traffic",      prefix: "Road Block" },
  { key: "landslide",emoji: "⛰️", label: "Landslide",    prefix: "Landslide"  },
  { key: "other",    emoji: "❓", label: "Other",        prefix: ""           },
] as const;
type ModalTypeKey = typeof MODAL_TYPES[number]["key"];

/* ── Safe cooldown ─────────────────────────────────────────── */
const SAFE_COOLDOWN_MS = 30 * 60 * 1000;
function safeKey(slug: string, loc: string | null) { return `kl_safe_${slug}_${loc || ""}`; }
function canMarkSafe(slug: string, loc: string | null) {
  try { const ts = localStorage.getItem(safeKey(slug, loc)); return !ts || Date.now() - parseInt(ts) > SAFE_COOLDOWN_MS; }
  catch { return true; }
}
function recordSafe(slug: string, loc: string | null) {
  try { localStorage.setItem(safeKey(slug, loc), String(Date.now())); } catch { /**/ }
}

/* ── Location ──────────────────────────────────────────────── */
const KERALA_DISTRICTS = [
  { slug: "kasaragod",          name: "Kasaragod",          lat: 12.4996, lon: 74.9869 },
  { slug: "kannur",             name: "Kannur",             lat: 11.8745, lon: 75.3704 },
  { slug: "wayanad",            name: "Wayanad",            lat: 11.6854, lon: 76.1320 },
  { slug: "kozhikode",          name: "Kozhikode",          lat: 11.2588, lon: 75.7804 },
  { slug: "malappuram",         name: "Malappuram",         lat: 11.0510, lon: 76.0711 },
  { slug: "palakkad",           name: "Palakkad",           lat: 10.7867, lon: 76.6548 },
  { slug: "thrissur",           name: "Thrissur",           lat: 10.5276, lon: 76.2144 },
  { slug: "ernakulam",          name: "Ernakulam",          lat:  9.9312, lon: 76.2673 },
  { slug: "idukki",             name: "Idukki",             lat:  9.9189, lon: 76.9705 },
  { slug: "kottayam",           name: "Kottayam",           lat:  9.5916, lon: 76.5222 },
  { slug: "alappuzha",          name: "Alappuzha",          lat:  9.4981, lon: 76.3388 },
  { slug: "pathanamthitta",     name: "Pathanamthitta",     lat:  9.2648, lon: 76.7870 },
  { slug: "kollam",             name: "Kollam",             lat:  8.8932, lon: 76.6141 },
  { slug: "thiruvananthapuram", name: "Thiruvananthapuram", lat:  8.5241, lon: 76.9366 },
];
type GpsResult = { place: string; districtName: string; districtSlug: string; lat: number; lon: number; locality: string | null; state: string | null; country: string | null; pincode: string | null; } | null;
function nearestDistrict(lat: number, lon: number) {
  let best = KERALA_DISTRICTS[0]; let bestSq = Infinity;
  for (const d of KERALA_DISTRICTS) { const sq = (d.lat - lat) ** 2 + (d.lon - lon) ** 2; if (sq < bestSq) { bestSq = sq; best = d; } }
  return best;
}
function findDistrictFromAddress(a: Record<string, string>) {
  const raw = (a.state_district || a.county || "").replace(/\s*district\s*/i, "").trim().toLowerCase();
  if (!raw) return null;
  return KERALA_DISTRICTS.find(d => d.name.toLowerCase() === raw || d.slug === raw.replace(/\s+/g, "")) ?? null;
}

/* ── Helpers ───────────────────────────────────────────────── */
const isSafeReport  = (r: Report) => r.content.toLowerCase().includes("[safe now]");
const reportStatusKey = (r: Report) => r.status === "resolved" ? "resolved" : isSafeReport(r) ? "safe" : "active";
const reportText    = (r: Report) => r.content.replace(/^\[.*?\]\s*/, "").trim() || r.content;
function reportShortType(r: Report): string {
  const text = reportText(r); // strips [prefix]
  const words = text.trim().split(" ").slice(0, 4).join(" ");
  return words || r.content.split(" ").slice(0, 4).join(" ");
}

/* ── Weather ticker ────────────────────────────────────────── */
type TickerItem = { name: string; code: number; prob: number; temp: number };

function tickerCondition(code: number, prob: number): { text: string; cls: string } {
  if (code >= 95) return { text: "⛈ Thunderstorm warning",       cls: "hp-ticker-item--danger" };
  if (code >= 80) return { text: `🌧 Rain showers (${prob}%)`,    cls: prob >= 60 ? "hp-ticker-item--warn" : "" };
  if (code >= 61) return { text: `🌧 Rain expected (${prob}%)`,   cls: prob >= 60 ? "hp-ticker-item--warn" : "" };
  if (code >= 51) return { text: `🌦 Drizzle likely (${prob}%)`,  cls: "" };
  if (code >= 45) return { text: "🌫 Foggy conditions",           cls: "" };
  if (code >= 3)  return { text: "☁ Overcast",                   cls: "" };
  if (code >= 1)  return { text: "⛅ Partly cloudy",              cls: "" };
  return           { text: "☀ Clear skies",                      cls: "" };
}

/* ── Chart data generators ─────────────────────────────────── */
function genHourly(peak: number, seed: number, n = 25): number[] {
  if (peak <= 0) return Array(n).fill(0);
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    const base = peak * t * t * (3 - 2 * t); // smoothstep: clean S-curve
    const noise = peak > 2 ? Math.sin(i * 2.1 + seed) * peak * 0.10 : 0;
    return Math.max(0, base + noise);
  });
}
function genMonthly(total: number, seed: number, months = 7): number[] {
  if (total <= 0) return Array(months).fill(0);
  return Array.from({ length: months }, (_, i) => {
    const t = i / (months - 1);
    const base = total * t * t * (3 - 2 * t);
    const noise = total > 2 ? Math.sin(i * 1.5 + seed) * total * 0.07 : 0;
    return Math.max(0, Math.min(total, base + noise));
  });
}

/* ── Dual Area Chart (Kerala trend: alerts + safe overlay) ─── */
function DualAreaChart({ alertValues, safeValues }: { alertValues: number[]; safeValues: number[] }) {
  const W = 300; const H = 100;
  const maxVal = Math.max(...alertValues, ...safeValues, 1);
  const mkLine = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? "M" : "L"} ${((i / (vals.length - 1)) * W).toFixed(1)} ${(H - 4 - ((v / maxVal) * (H - 8))).toFixed(1)}`).join(" ");
  const aLine = mkLine(alertValues);
  const sLine = mkLine(safeValues);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: "100%", display: "block" }}>
      <defs>
        <linearGradient id="dag-a" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#EF4444" stopOpacity="0.28" /><stop offset="100%" stopColor="#EF4444" stopOpacity="0.02" /></linearGradient>
        <linearGradient id="dag-s" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22C55E" stopOpacity="0.28" /><stop offset="100%" stopColor="#22C55E" stopOpacity="0.02" /></linearGradient>
      </defs>
      <path d={`${aLine} L ${W} ${H} L 0 ${H} Z`} fill="url(#dag-a)" />
      <path d={aLine} stroke="#EF4444" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d={`${sLine} L ${W} ${H} L 0 ${H} Z`} fill="url(#dag-s)" />
      <path d={sLine} stroke="#22C55E" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/* ── Area Chart ────────────────────────────────────────────── */
function AreaChart({ values, color }: { values: number[]; color: string }) {
  const W = 300; const H = 78;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * W,
    H - 4 - ((v / max) * (H - 8)),
  ]);
  const lineD = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const areaD = `${lineD} L ${W} ${H} L 0 ${H} Z`;
  const uid = `ac${color.replace(/[^0-9a-f]/gi, "").slice(0, 6)}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: "100%", display: "block" }}>
      <defs>
        <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.38" />
          <stop offset="100%" stopColor={color} stopOpacity="0.03" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#${uid})`} />
      <path d={lineD} stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3" fill={color} />)}
    </svg>
  );
}

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

/* ── District Flip Card ─────────────────────────────────────── */
function DistrictFlipCard({ district, reports, safeCount, cardIdx, lang }: {
  district: District; reports: Report[]; safeCount: number; cardIdx: number; lang: "en" | "ml";
}) {
  const { t } = useLanguage();
  const recent = useMemo(
    () => reports.filter(r => Date.now() - new Date(r.created_at).getTime() < THREE_DAYS_MS),
    [reports]
  );

  const [flipIdx, setFlipIdx] = useState(0);
  const [show, setShow] = useState(true);

  useEffect(() => {
    if (recent.length <= 1) return;
    const id = setInterval(() => {
      setShow(false);
      setTimeout(() => { setFlipIdx(i => (i + 1) % recent.length); setShow(true); }, 220);
    }, 3500 + cardIdx * 320);
    return () => clearInterval(id);
  }, [recent.length, cardIdx]);

  const advance = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (recent.length <= 1) return;
    setShow(false);
    setTimeout(() => { setFlipIdx(i => (i + 1) % recent.length); setShow(true); }, 120);
  };

  const rep          = recent[flipIdx] ?? null;
  const sk           = rep ? reportStatusKey(rep) : "active";
  const type         = rep ? reportShortType(rep) : null;
  const hasNoRecent  = recent.length === 0;

  return (
    <Link to={`/district/${district.slug}`} className="hp-dcard">
      <div className="hp-dcard-top">
        <div className="hp-dcard-info">
          <span className="hp-dcard-name">{district.name.toUpperCase()}</span>
          <span className="hp-dcard-cnt hp-dcard-cnt--alert">
            <TriangleAlert size={11} /> {district.active_reports_count} {district.active_reports_count === 1 ? t.reportWord : t.reportsWord}
          </span>
          <span className="hp-dcard-cnt hp-dcard-cnt--safe">
            <ShieldCheck size={11} /> {safeCount} {safeCount === 1 ? t.safeUpdateSingle : t.safeUpdatePlural}
          </span>
        </div>
        <div className="hp-dcard-latest">
          <span className="hp-dcard-latest-hd">
            {t.latestReport}{" "}
            <button className="hp-dcard-refresh" onClick={advance} tabIndex={-1}>
              <RefreshCw size={10} />
            </button>
          </span>
          {hasNoRecent ? (
            <span className="hp-dcard-no-recent">{t.noNewReports}</span>
          ) : (
            <>
              <span className={`hp-dcard-latest-type hp-dcard-latest-type--${sk}${show ? "" : " hp-dcard-fade"}`}>
                {type ?? "—"}
              </span>
              <span className={`hp-dcard-latest-time${show ? "" : " hp-dcard-fade"}`}>
                {rep ? timeAgo(rep.created_at, lang) : "—"}
              </span>
            </>
          )}
        </div>
      </div>
      <div className="hp-dcard-footer">
        <span>{t.viewDistrict}</span>
        <ArrowRight size={12} />
      </div>
    </Link>
  );
}

/* ══ HomePage ═══════════════════════════════════════════════ */
export function HomePage() {
  const { t, lang, toggle } = useLanguage();
  const navigate = useNavigate();

  /* Data */
  const [districts,       setDistricts]       = useState<District[]>([]);
  const [recentReports,   setRecentReports]   = useState<Report[]>([]);  // all Kerala
  const [locationReports, setLocationReports] = useState<Report[] | null>(null); // district when location set
  const [liveStats,       setLiveStats]       = useState<StatsResult | null>(null);
  const [loading,         setLoading]         = useState(true);
  const [locRptLoading,   setLocRptLoading]   = useState(false);

  /* Report slider */
  const [sliderIdx, setSliderIdx] = useState(0);

  /* Weather ticker */
  const [tickerItems, setTickerItems] = useState<TickerItem[]>([]);
  useEffect(() => {
    Promise.allSettled(
      KERALA_DISTRICTS.map(async d => {
        const r = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${d.lat}&longitude=${d.lon}` +
          `&daily=weather_code,precipitation_probability_max,temperature_2m_max` +
          `&timezone=Asia%2FKolkata&forecast_days=2`
        );
        const j = await r.json();
        return {
          name: d.name,
          code: j.daily.weather_code[1] as number,
          prob: (j.daily.precipitation_probability_max[1] ?? 0) as number,
          temp: Math.round(j.daily.temperature_2m_max[1] as number),
        } as TickerItem;
      })
    ).then(results => {
      setTickerItems(
        results
          .filter((r): r is PromiseFulfilledResult<TickerItem> => r.status === "fulfilled")
          .map(r => r.value)
      );
    });
  }, []);

  /* Modal */
  const [modalStep,   setModalStep]   = useState<"closed" | "open">("closed");
  const [incType,     setIncType]     = useState<ModalTypeKey | null>(null);
  const [content,     setContent]     = useState("");
  const [imageFiles,  setImageFiles]  = useState<File[]>([]);
  const [imgPreviews, setImgPreviews] = useState<string[]>([]);
  const [formError,   setFormError]   = useState<string | null>(null);
  const [btnState,    setBtnState]    = useState<"idle" | "posting" | "success">("idle");
  const [safeState,   setSafeState]   = useState<"idle" | "posting" | "success">("idle");
  const [actionError, setActionError] = useState<string | null>(null);
  const [locHint,     setLocHint]     = useState(false);
  const fileRef     = useRef<HTMLInputElement>(null);
  const resetTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipSearch  = useRef(false);

  /* Location search */
  const [gpsResult,   setGpsResult]   = useState<GpsResult>(null);
  const [locSearch,   setLocSearch]   = useState("");
  const [suggestions, setSuggestions] = useState<{ name: string; display: string; lat: number; lon: number; rawAddress: Record<string, string> }[]>([]);
  const [sugOpen,     setSugOpen]     = useState(false);
  const [sugBusy,     setSugBusy]     = useState(false);

  /* Report detail modal */
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);

  const reporterName = useMemo(() => `Anonymous #${Math.floor(Math.random() * 9000) + 1000}`, []);

  useEffect(() => {
    Promise.all([api.districts(), api.recentReports(20).catch(() => [] as Report[])])
      .then(([d, r]) => { setDistricts(d); setRecentReports(r); })
      .finally(() => setLoading(false));
    api.stats({}).then(setLiveStats).catch(() => {});
    /* Restore location selection after navigation away and back */
    try {
      const saved = sessionStorage.getItem("hp-loc");
      if (saved) {
        const gps = JSON.parse(saved);
        setGpsResult(gps);
        skipSearch.current = true;  // prevent search dropdown from opening on restore
        setLocSearch(`${gps.locality}, ${gps.districtName}`);
      }
    } catch {}
  }, []);

  useEffect(() => () => { if (resetTimer.current) clearTimeout(resetTimer.current); }, []);

  /* Fetch district reports when location is selected; clear when deselected */
  useEffect(() => {
    if (!gpsResult) { setLocationReports(null); sessionStorage.removeItem("hp-loc"); return; }
    sessionStorage.setItem("hp-loc", JSON.stringify(gpsResult));
    setLocRptLoading(true);
    setSliderIdx(0);
    api.districtReports(gpsResult.districtSlug, "newest", "all")
      .then(rs => setLocationReports(rs))
      .catch(() => setLocationReports(null))
      .finally(() => setLocRptLoading(false));
  }, [gpsResult?.districtSlug]); // eslint-disable-line

  /* Slider source: district reports when location set, else all-Kerala */
  const sliderSource  = locationReports ?? recentReports;
  const sliderReports = sliderSource.slice(0, 4);
  useEffect(() => {
    setSliderIdx(0);
  }, [gpsResult?.districtSlug]);
  useEffect(() => {
    if (sliderReports.length <= 1) return;
    const id = setInterval(() => setSliderIdx(i => (i + 1) % sliderReports.length), 5000);
    return () => clearInterval(id);
  }, [sliderReports.length]);

  /* Location search debounce — skipped after a selection to prevent reopen */
  useEffect(() => {
    if (skipSearch.current) { skipSearch.current = false; return; }
    const q = locSearch.trim();
    if (q.length < 2) { setSuggestions([]); setSugOpen(false); return; }
    setSugBusy(true);
    const id = setTimeout(async () => {
      try {
        const searchQ = /kerala/i.test(q) ? q : `${q}, Kerala`;
        const rows: any[] = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQ)}&countrycodes=in&bounded=0&limit=12&addressdetails=1&accept-language=en`,
          { headers: { "User-Agent": "KeralaLive/1.0" } }
        ).then(r => r.json());
        const keralaRows = rows.filter((r: any) =>
          /kerala/i.test(r.address?.state || "") || /kerala/i.test(r.display_name || "")
        );
        setSuggestions((keralaRows.length > 0 ? keralaRows : rows).slice(0, 8).map((r: any) => {
          const a: Record<string, string> = r.address || {};
          const name = a.hamlet || a.neighbourhood || a.suburb || a.village || a.town || String(r.display_name).split(",")[0].trim();
          return { name, display: String(r.display_name).split(",").slice(0, 3).join(",").trim(), lat: parseFloat(r.lat), lon: parseFloat(r.lon), rawAddress: a };
        }));
        setSugOpen(true);
      } catch { setSuggestions([]); }
      finally { setSugBusy(false); }
    }, 200);
    return () => { clearTimeout(id); setSugBusy(false); };
  }, [locSearch]);

  /* Derived */
  const safeByDistrict = useMemo(() => {
    const c: Record<string, number> = {};
    recentReports.forEach(r => { if (isSafeReport(r) && r.district_slug) c[r.district_slug] = (c[r.district_slug] || 0) + 1; });
    return c;
  }, [recentReports]);

  const reportsByDistrict = useMemo(() => {
    const m: Record<string, Report[]> = {};
    recentReports.forEach(r => { if (r.district_slug) { m[r.district_slug] = m[r.district_slug] || []; m[r.district_slug].push(r); } });
    return m;
  }, [recentReports]);

  const sortedDistricts = useMemo(() =>
    [...districts].sort((a, b) => b.active_reports_count - a.active_reports_count), [districts]);

  /* Kerala-wide chart data */
  const s = liveStats;
  const todayAlerts  = genHourly(s?.today_alerts  ?? 0, 1);
  const todaySafe    = genHourly(s?.today_safe    ?? 0, 2);
  const totalAlerts  = genMonthly(s?.active_alerts ?? 0, 3);
  const totalSafe    = genMonthly(s?.safe_updates  ?? 0, 4);

  /* Kerala overview stats */
  const activeDistrictCount = districts.filter(d => d.active_reports_count > 0).length;
  const contributorsCount   = useMemo(
    () => new Set(recentReports.map(r => r.reporter_name).filter(Boolean)).size,
    [recentReports]
  );

  /* Location-specific stats derived from locationReports */
  const todayStr = new Date().toDateString();
  const isToday  = (r: Report) => new Date(r.created_at).toDateString() === todayStr;
  const locRpts  = locationReports ?? [];
  const locTodayAlertCount = locRpts.filter(r => isToday(r) && !isSafeReport(r)).length;
  const locTodaySafeCount  = locRpts.filter(r => isToday(r) &&  isSafeReport(r)).length;
  const locTotalAlertCount = locRpts.filter(r => !isSafeReport(r)).length;
  const locTotalSafeCount  = locRpts.filter(r =>  isSafeReport(r)).length;
  const locTodayAlerts  = genHourly(locTodayAlertCount, 5);
  const locTodaySafe    = genHourly(locTodaySafeCount,  6);
  const locTotalAlerts  = genMonthly(locTotalAlertCount, 7);
  const locTotalSafe    = genMonthly(locTotalSafeCount,  8);

  /* Modal helpers */
  const handleFileAdd = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const sel = Array.from(e.target.files || []);
    if (!sel.length) return;
    const add = sel.slice(0, 5 - imageFiles.length);
    setImageFiles(p => [...p, ...add]);
    setImgPreviews(p => [...p, ...add.map(f => URL.createObjectURL(f))]);
    if (fileRef.current) fileRef.current.value = "";
  }, [imageFiles]);

  const removeFile = useCallback((i: number) => {
    URL.revokeObjectURL(imgPreviews[i]);
    setImageFiles(p => p.filter((_, j) => j !== i));
    setImgPreviews(p => p.filter((_, j) => j !== i));
  }, [imgPreviews]);

  const resetForm = useCallback(() => {
    setIncType(null); setContent("");
    imgPreviews.forEach(p => URL.revokeObjectURL(p));
    setImageFiles([]); setImgPreviews([]);
    setFormError(null); setBtnState("idle");
    if (fileRef.current) fileRef.current.value = "";
  }, [imgPreviews]); // eslint-disable-line

  const closeModal = useCallback(() => {
    if (btnState === "posting") return;
    setModalStep("closed"); resetForm();
  }, [btnState, resetForm]); // eslint-disable-line

  const handleSubmit = async () => {
    if (btnState !== "idle") return;
    if (!content.trim()) { setFormError("Please describe what happened."); return; }
    if (!gpsResult)      { setFormError("Please set your location in the search bar above first."); return; }
    setFormError(null); setBtnState("posting");
    try {
      const tp = MODAL_TYPES.find(x => x.key === incType);
      const pfx = tp?.prefix ? `[${tp.prefix}] ` : "";
      const rep = await api.createReport(gpsResult.districtSlug, {
        reporter_name: reporterName, content: pfx + content.trim(),
        location_attached: true, latitude: gpsResult.lat, longitude: gpsResult.lon,
        locality: gpsResult.locality, state: gpsResult.state, country: gpsResult.country, pincode: gpsResult.pincode,
      });
      for (const f of imageFiles) { try { await api.uploadImage(rep.id, f); } catch {} }
      setBtnState("success");
      setRecentReports(p => [rep, ...p.filter(r => r.id !== rep.id).slice(0, 19)]);
      setLocationReports(p => p !== null ? [rep, ...p.filter(r => r.id !== rep.id)] : null);
      api.recentReports(20).then(setRecentReports).catch(() => {});
      api.districts().then(setDistricts).catch(() => {});
      api.stats({}).then(setLiveStats).catch(() => {});
      if (gpsResult) api.districtReports(gpsResult.districtSlug, "newest", "all").then(setLocationReports).catch(() => {});
      resetTimer.current = setTimeout(() => { resetForm(); setModalStep("closed"); }, 2600);
    } catch { setFormError("Failed to post. Please try again."); setBtnState("idle"); }
  };

  const openAlert = () => { setContent(""); setModalStep("open"); };
  const openSafe  = () => {
    if (!gpsResult) { setActionError("Please set your location first."); setTimeout(() => setActionError(null), 3000); return; }
    if (safeState !== "idle") return;
    if (!canMarkSafe(gpsResult.districtSlug, gpsResult.locality)) {
      setActionError("You marked this area safe recently."); setTimeout(() => setActionError(null), 4000); return;
    }
    setSafeState("posting");
    api.createReport(gpsResult.districtSlug, {
      reporter_name: reporterName, content: "[Safe Now] Area confirmed safe",
      location_attached: true, latitude: gpsResult.lat, longitude: gpsResult.lon,
      locality: gpsResult.locality, state: gpsResult.state, country: gpsResult.country, pincode: gpsResult.pincode,
    }).then(() => {
      recordSafe(gpsResult.districtSlug, gpsResult.locality);
      setSafeState("success");
      api.districts().then(setDistricts).catch(() => {});
      api.recentReports(20).then(setRecentReports).catch(() => {});
      api.stats({}).then(setLiveStats).catch(() => {});
      if (gpsResult) api.districtReports(gpsResult.districtSlug, "newest", "all").then(setLocationReports).catch(() => {});
      setTimeout(() => setSafeState("idle"), 2500);
    }).catch(() => setSafeState("idle"));
  };

  const selectLoc = (sg: typeof suggestions[number]) => {
    const district = findDistrictFromAddress(sg.rawAddress) ?? nearestDistrict(sg.lat, sg.lon);
    const gps: GpsResult = { place: `${sg.name}, ${district.name}`, districtName: district.name, districtSlug: district.slug, lat: sg.lat, lon: sg.lon, locality: sg.name, state: "Kerala", country: "India", pincode: sg.rawAddress.postcode || null };
    const label = `${sg.name}, ${district.name}`;
    skipSearch.current = true;  // stop the effect from re-triggering a search
    setGpsResult(gps);
    setLocSearch(label);
    setSugOpen(false);
    setSuggestions([]);
  };

  const goDistrict = (slug: string, statusFilter: string) =>
    navigate(`/district/${slug}`, { state: { statusFilter } });

  const defaultSlug = (gpsResult?.districtSlug) || (sortedDistricts[0]?.slug) || "kannur";

  const handleOpenReport = async (r: Report) => {
    try { setSelectedReport(await api.reportDetail(r.id)); } catch { setSelectedReport(r); }
  };

  const sliderReport = sliderReports[sliderIdx] ?? null;

  /* ── Render ──────────────────────────────────────────────── */
  return (
    <div className="hp-page">

      {/* ── Report Alert Modal (single step) ── */}
      {modalStep === "open" && (
        <div className="cr-backdrop" onClick={closeModal}>
          <div className="cr-modal" onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="cr-hdr">
              <span className="cr-hdr-title">Report Alert</span>
              <button className="cr-hdr-close" onClick={closeModal}><X size={16} /></button>
            </div>

            {/* Body */}
            <div className="cr-body">

              {/* Location */}
              <div className="cr-modal-loc">
                <MapPin size={13} />
                <span>
                  {gpsResult
                    ? `${gpsResult.locality || gpsResult.districtName}, ${gpsResult.districtName}`
                    : "No location set — close and search your location first"}
                </span>
              </div>

              {/* Description */}
              <div className="cr-field">
                <label className="cr-field-label">Description</label>
                <textarea
                  className="cr-textarea"
                  maxLength={500}
                  placeholder="Describe what happened..."
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  autoFocus
                />
                <div className="cr-char">{content.length} / 500</div>
              </div>

              {/* Alert Type */}
              <div className="cr-field">
                <label className="cr-field-label">Alert Type</label>
                <div className="cr-type-chips">
                  {MODAL_TYPES.map(tp => (
                    <button
                      key={tp.key}
                      className={`cr-type-chip${incType === tp.key ? " cr-type-chip--on" : ""}`}
                      onClick={() => setIncType(incType === tp.key ? null : tp.key)}
                    >
                      {tp.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Photo */}
              <div className="cr-field">
                <label className="cr-field-label">
                  Photo <span className="cr-field-label--opt">(optional)</span>
                </label>
                <div className="cr-photo-row">
                  <label className="cr-photo-btn">
                    <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={handleFileAdd} />
                    📷 Add Photo
                  </label>
                  {imgPreviews.map((src, i) => (
                    <div key={i} className="cr-thumb">
                      <img src={src} alt="" />
                      <button className="cr-thumb-rm" onClick={e => { e.preventDefault(); removeFile(i); }}><X size={8} /></button>
                    </div>
                  ))}
                  {imageFiles.length > 0 && imageFiles.length < 5 && (
                    <label className="cr-photo-btn">
                      <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleFileAdd} />
                      + More
                    </label>
                  )}
                </div>
              </div>

              {formError && <p className="cr-error">{formError}</p>}
            </div>

            {/* Footer */}
            <div className="cr-footer">
              <button className="cr-btn-cancel" onClick={closeModal}>Cancel</button>
              <button
                className={`cr-btn-submit${btnState === "success" ? " cr-btn-submit--ok" : ""}`}
                onClick={handleSubmit}
                disabled={btnState !== "idle"}
              >
                {btnState === "posting" ? <><span className="cr-spin" /> Submitting…</> :
                 btnState === "success" ? <><Check size={14} /> Alert Submitted!</> :
                 <>Submit Alert <ArrowRight size={14} /></>}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── Top bar ── */}
      <div className="hp-topbar">
        <div className="hp-topbar-hd">
          <h1 className="hp-main-title">{t.mainTitle}</h1>
          <button className="hp-lang-toggle" onClick={toggle}>{lang === "en" ? "EN" : "ML"}</button>
        </div>
        <p className="hp-main-sub">{t.mainSub}</p>
      </div>

      {/* ── Weather ticker ── */}
      {tickerItems.length > 0 && (
        <div className="hp-ticker">
          <div className="hp-ticker-label">
            🌤 {lang === "ml" ? "നാളെ" : "TOMORROW"}
          </div>
          <div className="hp-ticker-track">
            <span className="hp-ticker-content">
              {tickerItems.map((item, i) => {
                const { text, cls } = tickerCondition(item.code, item.prob);
                return (
                  <span key={item.name}>
                    <span className={`hp-ticker-item${cls ? " " + cls : ""}`}>
                      <strong>{item.name}</strong>: {text} · {item.temp}°C
                    </span>
                    {i < tickerItems.length - 1 && (
                      <span className="hp-ticker-sep">|</span>
                    )}
                  </span>
                );
              })}
            </span>
          </div>
        </div>
      )}

      {/* ── Main 60/40 ── */}
      <div className="hp-main">

        {/* ── Left column ── */}
        <div className="hp-left-col">
          <div className="hp-left-card">

            {/* ── Location search — always at top of card ── */}
            <div className="hp-ls hp-ls-loc">
              <div className="hp-ls-title">{t.chooseLocation}</div>
              <div className="hp-loc-wrap">
                {gpsResult ? (
                  <div className="hp-loc-selected">
                    <MapPin size={15} className="hp-loc-sel-icon" />
                    <div className="hp-loc-sel-text">
                      <span className="hp-loc-sel-name">{gpsResult.locality || gpsResult.districtName}</span>
                      <span className="hp-loc-sel-sub">{gpsResult.districtName} · Kerala</span>
                    </div>
                    <button className="hp-loc-change-btn" onClick={() => { setGpsResult(null); setLocSearch(""); setSuggestions([]); setLocationReports(null); }}>
                      <Search size={12} /> {t.searchAnotherLoc}
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="hp-loc-box">
                      <Search size={16} className="hp-loc-icon" />
                      <input
                        className="hp-loc-input"
                        placeholder={t.searchPlaceholder}
                        value={locSearch}
                        onChange={e => setLocSearch(e.target.value)}
                        onFocus={() => suggestions.length > 0 && setSugOpen(true)}
                        onBlur={() => setTimeout(() => setSugOpen(false), 150)}
                        autoFocus
                      />
                    </div>
                    {sugOpen && suggestions.length > 0 && (
                      <ul className="hp-loc-suggestions">
                        {suggestions.map((sg, i) => (
                          <li key={i} className="hp-loc-sug-item" onMouseDown={() => selectLoc(sg)}>
                            <span className="hp-loc-sug-name">{sg.name}</span>
                            <span className="hp-loc-sug-display">{sg.display}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
              {actionError && <p className="hp-action-err">{actionError}</p>}
            </div>

            {!gpsResult ? (
              /* ═══ STATE 1: Kerala Overview (no location selected) ═══ */
              <>
                {/* Overview info */}
                <div className="hp-ls">
                  <div className="hp-ls-title">{t.keralaOverview}</div>
                  <div className="hp-info-line">
                    {activeDistrictCount} {t.activeWord}
                    &nbsp;•&nbsp;{s?.today_alerts ?? 0} {t.reportsWord}
                    &nbsp;•&nbsp;{s?.today_safe ?? 0} {t.safeWord}
                    &nbsp;•&nbsp;{contributorsCount} {t.contributorsShort}
                  </div>
                </div>

                {/* Report actions */}
                <div className="hp-ls">
                  <div className="hp-ls-title">{t.reportToCommunity}</div>
                  <div className="hp-action-pair">
                    <button className="hp-action-btn" onClick={() => { setLocHint(true); setTimeout(() => setLocHint(false), 3500); }}>
                      <div className="hp-action-icon-box hp-action-icon-box--alert"><TriangleAlert size={18} /></div>
                      <div className="hp-action-text">
                        <span className="hp-action-label">{t.reportAlertLabel}</span>
                        <span className="hp-action-desc">{t.reportAlertDesc}</span>
                      </div>
                      <ArrowRight size={14} className="hp-action-arrow" />
                    </button>
                    <button className="hp-action-btn" onClick={() => { setLocHint(true); setTimeout(() => setLocHint(false), 3500); }}>
                      <div className="hp-action-icon-box hp-action-icon-box--safe"><ShieldCheck size={18} /></div>
                      <div className="hp-action-text">
                        <span className="hp-action-label">{t.markSafeLabel}</span>
                        <span className="hp-action-desc">{t.markSafeDesc}</span>
                      </div>
                      <ArrowRight size={14} className="hp-action-arrow" />
                    </button>
                  </div>
                  {locHint && (
                    <p className="hp-loc-hint">{t.searchLocHint}</p>
                  )}
                </div>
              </>
            ) : (
              /* ═══ STATE 2: Location Overview (location selected) ═══ */
              <>
                {/* Report actions — FIRST so user reaches them without passing chips */}
                <div className="hp-ls">
                  <div className="hp-ls-title">{t.reportToCommunity}</div>
                  <div className="hp-action-pair">
                    <button className="hp-action-btn" onClick={openAlert}>
                      <div className="hp-action-icon-box hp-action-icon-box--alert"><TriangleAlert size={18} /></div>
                      <div className="hp-action-text">
                        <span className="hp-action-label">{t.reportAlertLabel}</span>
                        <span className="hp-action-desc">{t.reportAlertDesc}</span>
                      </div>
                      <ArrowRight size={14} className="hp-action-arrow" />
                    </button>
                    <button className="hp-action-btn" onClick={openSafe}>
                      <div className="hp-action-icon-box hp-action-icon-box--safe">
                        {safeState === "success" ? <Check size={18} /> : <ShieldCheck size={18} />}
                      </div>
                      <div className="hp-action-text">
                        <span className="hp-action-label">{safeState === "success" ? t.markSafeLabelDone : t.markSafeLabel}</span>
                        <span className="hp-action-desc">{safeState === "posting" ? t.submittingLabel : t.markSafeDesc}</span>
                      </div>
                      <ArrowRight size={14} className="hp-action-arrow" />
                    </button>
                  </div>
                </div>

                {/* Location stats + filter chips — BELOW actions */}
                <div className="hp-ls">
                  <div className="hp-ls-title">
                    {(gpsResult.locality || gpsResult.districtName).toUpperCase()} OVERVIEW
                  </div>

                  <div className="hp-chip-group">
                    <span className="hp-chip-label">{t.todayLabel2}</span>
                    <div className="hp-chip-row">
                      <button className="hp-chip hp-chip--alert" onClick={() => navigate(`/district/${gpsResult.districtSlug}`, { state: { statusFilter: "active", localityFilter: gpsResult.locality, dateFilter: "today" } })}>
                        <TriangleAlert size={11} />{locTodayAlertCount} {locTodayAlertCount !== 1 ? t.alertsWord : t.alertsWord}
                      </button>
                      <button className="hp-chip hp-chip--safe" onClick={() => navigate(`/district/${gpsResult.districtSlug}`, { state: { statusFilter: "safe", localityFilter: gpsResult.locality, dateFilter: "today" } })}>
                        <ShieldCheck size={11} />{locTodaySafeCount} {locTodaySafeCount !== 1 ? t.safeUpdatePlural : t.safeUpdateSingle}
                      </button>
                    </div>
                  </div>

                  <div className="hp-chip-group">
                    <span className="hp-chip-label">{t.overallLabel}</span>
                    <div className="hp-chip-row">
                      <button className="hp-chip hp-chip--alert" onClick={() => navigate(`/district/${gpsResult.districtSlug}`, { state: { statusFilter: "active", localityFilter: gpsResult.locality } })}>
                        <TriangleAlert size={11} />{locTotalAlertCount} {locTotalAlertCount !== 1 ? t.alertsWord : t.alertsWord}
                      </button>
                      <button className="hp-chip hp-chip--safe" onClick={() => navigate(`/district/${gpsResult.districtSlug}`, { state: { statusFilter: "safe", localityFilter: gpsResult.locality } })}>
                        <ShieldCheck size={11} />{locTotalSafeCount} {locTotalSafeCount !== 1 ? t.safeUpdatePlural : t.safeUpdateSingle}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

          </div>{/* /.hp-left-card */}
        </div>{/* /.hp-left-col */}

        {/* ── Right column (slider) ── */}
        <div className="hp-right-col">
          <div className="hp-slider-card">
            <div className="hp-slider-hd">
              <span className="hp-slider-hd-title">
                {t.liveAcrossKerala}
                {locRptLoading && <span style={{ marginLeft: 8, fontSize: 10, opacity: 0.6 }}>Loading…</span>}
              </span>
              {gpsResult && (
                <button className="hp-slider-view-all" onClick={() => navigate(`/district/${gpsResult.districtSlug}`)}>
                  {gpsResult.districtName} Reports <ArrowRight size={13} />
                </button>
              )}
            </div>

            {/* Image area */}
            <div className="hp-slider-img-area">
              {sliderReport?.images?.length > 0 ? (
                <img
                  className="hp-slider-img"
                  src={imageUrl(sliderReport.images[0].file_path)}
                  alt={sliderReport.content}
                />
              ) : (
                <div className={`hp-slider-placeholder hp-slider-placeholder--${sliderReport ? reportStatusKey(sliderReport) : "active"}`}>
                  {sliderReport ? (
                    reportStatusKey(sliderReport) === "safe" ? <ShieldCheck size={56} opacity={0.35} /> :
                    reportStatusKey(sliderReport) === "resolved" ? <BadgeCheck size={56} opacity={0.35} /> :
                    <TriangleAlert size={56} opacity={0.35} />
                  ) : <TriangleAlert size={56} opacity={0.2} />}
                </div>
              )}

              {/* Arrows */}
              {sliderReports.length > 1 && (
                <>
                  <button className="hp-slider-arrow hp-slider-arrow--prev" onClick={() => setSliderIdx(i => (i - 1 + sliderReports.length) % sliderReports.length)}>
                    ‹
                  </button>
                  <button className="hp-slider-arrow hp-slider-arrow--next" onClick={() => setSliderIdx(i => (i + 1) % sliderReports.length)}>
                    ›
                  </button>
                  <div className="hp-slider-dots">
                    {sliderReports.map((_, i) => (
                      <span key={i} className={`hp-slider-dot${sliderIdx === i ? " hp-slider-dot--on" : ""}`} onClick={() => setSliderIdx(i)} />
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Content */}
            {sliderReport ? (
              <div className="hp-slider-body" onClick={() => handleOpenReport(sliderReport)}>
                <h2 className="hp-slider-title">{reportText(sliderReport)}</h2>
                <div className="hp-slider-meta">
                  {(sliderReport.locality || sliderReport.district_name) && (
                    <span><MapPin size={12} />{sliderReport.locality || sliderReport.district_name}</span>
                  )}
                  <span><Clock size={12} />{timeAgo(sliderReport.created_at, lang)}</span>
                </div>
                <div className="hp-slider-metrics">
                  <span className="hp-slider-metric">
                    <CheckCircle size={18} /><strong>{sliderReport.confirmed_count}</strong><small>{t.confirmationsLabel}</small>
                  </span>
                  <span className="hp-slider-metric">
                    <MessageSquare size={18} /><strong>{sliderReport.comment_count}</strong><small>{t.commentsWord}</small>
                  </span>
                  <span className="hp-slider-metric">
                    <Eye size={18} /><strong>{sliderReport.views_count ?? 0}</strong><small>{t.viewsLabel}</small>
                  </span>
                  <span className="hp-slider-metric hp-slider-metric--share">
                    <Share2 size={18} /><small>{t.shareWord}</small>
                  </span>
                </div>
              </div>
            ) : (
              <div className="hp-slider-empty">{t.noRecentReportsSlider}</div>
            )}
          </div>
        </div>{/* /.hp-right-col */}

      </div>{/* /.hp-main */}

      {/* ── All Districts ── */}
      <div className="hp-districts">
        <div className="hp-districts-hd">
          <h2 className="hp-districts-title">{t.allDistricts}</h2>
        </div>
        {loading ? (
          <div className="hp-dcard-grid">
            {Array.from({ length: 14 }).map((_, i) => <div key={i} className="hp-dcard-skel" />)}
          </div>
        ) : (
          <div className="hp-dcard-grid">
            {sortedDistricts.map((d, idx) => (
              <DistrictFlipCard
                key={d.slug}
                district={d}
                reports={reportsByDistrict[d.slug] ?? []}
                safeCount={safeByDistrict[d.slug] ?? 0}
                cardIdx={idx}
                lang={lang}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Site Footer ── */}
      <footer className="hp-site-footer">
        <span className="hp-site-footer-copy">© 2025 LiveDisaster · Built for Kerala</span>
        <div className="hp-site-footer-right">
          <a href="https://www.linkedin.com/in/jishinc" target="_blank" rel="noopener noreferrer" className="hp-site-footer-dev">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
            Developed by Jishin C
          </a>
        </div>
      </footer>

      {selectedReport && (
        <ReportDetailModal
          report={selectedReport}
          related={recentReports.filter(r => r.id !== selectedReport.id).slice(0, 4)}
          onClose={() => setSelectedReport(null)}
          onUpdated={(updated: Report) => {
            setSelectedReport(updated);
            setRecentReports(prev => prev.map(r => r.id === updated.id ? updated : r));
          }}
        />
      )}
    </div>
  );
}
