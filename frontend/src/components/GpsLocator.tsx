import { ChevronDown, MapPin, Navigation, RefreshCw, X } from "lucide-react";
import { useCallback, useState } from "react";
import type { District } from "../types";

const DISTRICT_TABLE: [string, string, string][] = [
  ["thiruvananthapuram", "thiruvananthapuram", "Thiruvananthapuram"],
  ["trivandrum",         "thiruvananthapuram", "Thiruvananthapuram"],
  ["kollam",             "kollam",             "Kollam"],
  ["pathanamthitta",     "pathanamthitta",     "Pathanamthitta"],
  ["alappuzha",          "alappuzha",          "Alappuzha"],
  ["alleppey",           "alappuzha",          "Alappuzha"],
  ["kottayam",           "kottayam",           "Kottayam"],
  ["idukki",             "idukki",             "Idukki"],
  ["ernakulam",          "ernakulam",          "Ernakulam"],
  ["kochi",              "ernakulam",          "Ernakulam"],
  ["thrissur",           "thrissur",           "Thrissur"],
  ["trichur",            "thrissur",           "Thrissur"],
  ["palakkad",           "palakkad",           "Palakkad"],
  ["malappuram",         "malappuram",         "Malappuram"],
  ["kozhikode",          "kozhikode",          "Kozhikode"],
  ["calicut",            "kozhikode",          "Kozhikode"],
  ["wayanad",            "wayanad",            "Wayanad"],
  ["kannur",             "kannur",             "Kannur"],
  ["kasaragod",          "kasaragod",          "Kasaragod"],
];

function resolveDistrict(addr: Record<string, string>): { slug: string; name: string } | null {
  const fields = [addr.county, addr.state_district, addr.city, addr.town, addr.suburb]
    .filter(Boolean)
    .map((f) => f!.toLowerCase());
  for (const field of fields)
    for (const [match, slug, name] of DISTRICT_TABLE)
      if (field.includes(match)) return { slug, name };
  return null;
}

export type GpsResult = {
  place: string;
  districtName: string;
  districtSlug: string;
  lat: number;
  lon: number;
} | null;

type Phase = "prompt" | "detecting" | "found" | "denied";

export function GpsLocator({
  districts,
  onChange,
}: {
  districts: District[];
  onChange: (r: GpsResult) => void;
}) {
  const [phase,     setPhase]     = useState<Phase>("prompt");
  const [result,    setResult]    = useState<GpsResult>(null);
  const [showModal, setShowModal] = useState(false);

  const detect = useCallback(() => {
    setShowModal(false);
    if (!navigator.geolocation) { setPhase("denied"); return; }
    setPhase("detecting");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        try {
          const res  = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`,
            { headers: { "User-Agent": "KeralaLive/1.0" } }
          );
          const data = await res.json();
          const addr = (data.address ?? {}) as Record<string, string>;
          const place = [
            addr.suburb ?? addr.hamlet ?? addr.neighbourhood,
            addr.village ?? addr.town ?? addr.city_district,
          ].filter(Boolean).slice(0, 2).join(", ")
            || data.display_name?.split(",")[0]
            || "Your Location";
          const district = resolveDistrict(addr);
          const r: GpsResult = {
            place,
            districtName: district?.name ?? (addr.county ?? "Kerala"),
            districtSlug: district?.slug ?? "kannur",
            lat: parseFloat(lat.toFixed(5)),
            lon: parseFloat(lon.toFixed(5)),
          };
          setResult(r);
          setPhase("found");
          onChange(r);
        } catch {
          setPhase("denied");
        }
      },
      () => setPhase("denied"),
      { timeout: 10000 }
    );
  }, [onChange]);

  const handleManualSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (!e.target.value) { onChange(null); return; }
    const d = districts.find((x) => x.slug === e.target.value);
    const r: GpsResult = {
      place:        d?.name ?? e.target.value,
      districtName: d?.name ?? e.target.value,
      districtSlug: e.target.value,
      lat: 0, lon: 0,
    };
    setResult(r);
    setPhase("found");
    onChange(r);
  };

  /* ── Custom permission modal ── */
  const PermModal = () => (
    <div className="loc-backdrop" onClick={() => setShowModal(false)}>
      <div className="loc-modal" onClick={(e) => e.stopPropagation()}>
        <button className="loc-modal-close" onClick={() => setShowModal(false)}>
          <X size={16} />
        </button>

        <div className="loc-modal-icon">
          <Navigation size={30} strokeWidth={1.8} />
        </div>

        <h3 className="loc-modal-title">Share Your Location</h3>
        <p className="loc-modal-body">
          Kerala Live uses your location to automatically identify your district
          and send your report to the right place. No location data is stored.
        </p>

        <div className="loc-modal-tips">
          <span className="loc-tip"><span className="loc-tip-dot" />Instantly routes to correct district</span>
          <span className="loc-tip"><span className="loc-tip-dot" />Location is never stored or shared</span>
        </div>

        <div className="loc-modal-actions">
          <button className="loc-allow-btn" onClick={detect}>
            <Navigation size={17} strokeWidth={2} />
            Allow Location Access
          </button>
          <button className="loc-deny-btn" onClick={() => { setShowModal(false); setPhase("denied"); }}>
            Choose District Manually
          </button>
        </div>
      </div>
    </div>
  );

  /* ── Detecting ── */
  if (phase === "detecting") {
    return (
      <div className="gl-box gl-box--detecting">
        <span className="gl-spinner" />
        <div className="gl-detecting-info">
          <span className="gl-detecting-text">Finding your location…</span>
          <span className="gl-detecting-sub">Please allow access when your browser asks</span>
        </div>
      </div>
    );
  }

  /* ── Found ── */
  if (phase === "found" && result) {
    return (
      <div className="gl-box gl-box--found">
        <div className="gl-found-left">
          <span className="gl-pin-circle">
            <MapPin size={18} strokeWidth={2.5} />
          </span>
          <div className="gl-found-info">
            <span className="gl-found-place">{result.place}</span>
            <span className="gl-found-district">
              {result.lat !== 0 ? "📍 GPS · " : "🗺 Manual · "}{result.districtName} District
            </span>
          </div>
        </div>
        <button
          className="gl-change-btn"
          onClick={() => { setPhase("prompt"); onChange(null); setResult(null); }}
        >
          Change
        </button>
      </div>
    );
  }

  /* ── Denied — dropdown only ── */
  if (phase === "denied") {
    return (
      <div className="gl-box gl-box--manual">
        <div className="gl-denied-row">
          <span className="gl-denied-icon">⚠️</span>
          <span className="gl-denied-text">GPS unavailable — pick your district</span>
          <button className="gl-retry-btn" onClick={() => setShowModal(true)}>
            <RefreshCw size={12} /> Retry GPS
          </button>
        </div>
        <div className="gl-select-wrap">
          <ChevronDown size={15} className="gl-chevron" />
          <select className="gl-select" defaultValue="" onChange={handleManualSelect}>
            <option value="">Select your district…</option>
            {districts.map((d) => (
              <option key={d.slug} value={d.slug}>{d.name}</option>
            ))}
          </select>
        </div>
        {showModal && <PermModal />}
      </div>
    );
  }

  /* ── Prompt — GPS card + district dropdown ── */
  return (
    <>
      {showModal && <PermModal />}
      <div className="gl-box gl-box--prompt">
        <button className="gl-gps-btn" onClick={() => setShowModal(true)}>
          <span className="gl-gps-icon-wrap">
            <Navigation size={22} strokeWidth={2} />
          </span>
          <span className="gl-gps-content">
            <span className="gl-gps-title">Use GPS Location</span>
            <span className="gl-gps-sub">Auto-detect your district instantly</span>
          </span>
          <span className="gl-gps-arrow">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </span>
        </button>

        <div className="gl-or-row">
          <span className="gl-or-line" />
          <span className="gl-or-label">or choose manually</span>
          <span className="gl-or-line" />
        </div>

        <div className="gl-select-wrap">
          <ChevronDown size={15} className="gl-chevron" />
          <select className="gl-select" defaultValue="" onChange={handleManualSelect}>
            <option value="">Select your district…</option>
            {districts.map((d) => (
              <option key={d.slug} value={d.slug}>{d.name}</option>
            ))}
          </select>
        </div>
      </div>
    </>
  );
}
