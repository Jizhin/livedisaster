import { Loader2, MapPin } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

declare var L: any;

/* ── Kerala district alias table ───────────────────────── */
const DISTRICT_TABLE: [string, string, string][] = [
  ["thiruvananthapuram", "thiruvananthapuram", "Thiruvananthapuram"],
  ["trivandrum",          "thiruvananthapuram", "Thiruvananthapuram"],
  ["kollam",              "kollam",             "Kollam"],
  ["quilon",              "kollam",             "Kollam"],
  ["pathanamthitta",      "pathanamthitta",     "Pathanamthitta"],
  ["alappuzha",           "alappuzha",          "Alappuzha"],
  ["alleppey",            "alappuzha",          "Alappuzha"],
  ["kottayam",            "kottayam",           "Kottayam"],
  ["idukki",              "idukki",             "Idukki"],
  ["ernakulam",           "ernakulam",          "Ernakulam"],
  ["kochi",               "ernakulam",          "Ernakulam"],
  ["cochin",              "ernakulam",          "Ernakulam"],
  ["thrissur",            "thrissur",           "Thrissur"],
  ["trichur",             "thrissur",           "Thrissur"],
  ["palakkad",            "palakkad",           "Palakkad"],
  ["palghat",             "palakkad",           "Palakkad"],
  ["malappuram",          "malappuram",         "Malappuram"],
  ["kozhikode",           "kozhikode",          "Kozhikode"],
  ["calicut",             "kozhikode",          "Kozhikode"],
  ["wayanad",             "wayanad",            "Wayanad"],
  ["kannur",              "kannur",             "Kannur"],
  ["cannanore",           "kannur",             "Kannur"],
  ["kasaragod",           "kasaragod",          "Kasaragod"],
  ["kasaragode",          "kasaragod",          "Kasaragod"],
];

function resolveDistrict(addr: Record<string, string>): { slug: string; name: string } | null {
  const fields = [
    addr.county, addr.state_district, addr.city, addr.town, addr.suburb,
  ].filter(Boolean).map((f) => f!.toLowerCase());
  for (const field of fields) {
    for (const [match, slug, name] of DISTRICT_TABLE) {
      if (field.includes(match)) return { slug, name };
    }
  }
  return null;
}

export type LocResult = {
  lat: number;
  lon: number;
  place: string;
  districtSlug: string | null;
  districtName: string | null;
};

type Phase = "detecting" | "tap" | "geocoding" | "found";

export function LocationPicker({ onChange }: { onChange: (loc: LocResult | null) => void }) {
  const mapRef     = useRef<any>(null);
  const markerRef  = useRef<any>(null);
  const cbRef      = useRef(onChange);
  cbRef.current = onChange;

  const [phase,  setPhase]  = useState<Phase>("detecting");
  const [result, setResult] = useState<LocResult | null>(null);

  const placePin = useCallback(async (lat: number, lon: number) => {
    const map = mapRef.current;
    if (!map || typeof L === "undefined") return;

    /* Move or create draggable marker */
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lon]);
    } else {
      const icon = L.divIcon({
        html: `<div class="lp-pin-outer"><div class="lp-pin-inner"></div></div>`,
        className: "",
        iconSize: [26, 36],
        iconAnchor: [13, 36],
      });
      markerRef.current = L.marker([lat, lon], { draggable: true, icon }).addTo(map);
      markerRef.current.on("dragend", function (this: any) {
        const p = this.getLatLng();
        placePin(p.lat, p.lng);
      });
    }

    map.flyTo([lat, lon], Math.max(map.getZoom(), 11), { animate: true, duration: 0.7 });
    setPhase("geocoding");

    /* Reverse geocode */
    try {
      const res  = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`,
        { headers: { "User-Agent": "KeralaLive/1.0" } }
      );
      const data = await res.json();
      const addr = (data.address ?? {}) as Record<string, string>;

      const parts = [
        addr.suburb ?? addr.hamlet ?? addr.neighbourhood,
        addr.village ?? addr.city_district ?? addr.town,
        addr.town ?? addr.city,
      ].filter(Boolean);
      const place    = parts.slice(0, 2).join(", ")
        || data.display_name?.split(",")[0]
        || `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
      const district = resolveDistrict(addr);

      const loc: LocResult = {
        lat:          parseFloat(lat.toFixed(5)),
        lon:          parseFloat(lon.toFixed(5)),
        place,
        districtSlug: district?.slug ?? null,
        districtName: district?.name ?? null,
      };
      setResult(loc);
      setPhase("found");
      cbRef.current(loc);
    } catch {
      const loc: LocResult = {
        lat:          parseFloat(lat.toFixed(5)),
        lon:          parseFloat(lon.toFixed(5)),
        place:        `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
        districtSlug: null,
        districtName: null,
      };
      setResult(loc);
      setPhase("found");
      cbRef.current(loc);
    }
  }, []);

  useEffect(() => {
    if (typeof L === "undefined" || mapRef.current) return;

    const map = L.map("lp-map", {
      center: [10.5, 76.2],
      zoom: 7,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      subdomains: "abcd",
      maxZoom: 18,
    }).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);
    mapRef.current = map;

    map.on("click", (e: any) => placePin(e.latlng.lat, e.latlng.lng));

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => placePin(pos.coords.latitude, pos.coords.longitude),
        ()    => setPhase("tap"),
        { timeout: 8000 }
      );
    } else {
      setPhase("tap");
    }

    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
      markerRef.current = null;
    };
  }, [placePin]);

  return (
    <div className="lp-wrap">
      <div id="lp-map" className="lp-map" />
      <div className="lp-footer">
        {(phase === "detecting" || phase === "geocoding") && (
          <div className="lp-status lp-status--spin">
            <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
            {phase === "detecting" ? "Detecting your location…" : "Identifying place…"}
          </div>
        )}
        {phase === "tap" && (
          <div className="lp-status lp-status--tap">
            <MapPin size={12} />
            Tap the map to mark your location
          </div>
        )}
        {phase === "found" && result && (
          <div className="lp-result">
            <div className="lp-result-left">
              <span className="lp-pin-emoji">📍</span>
              <div className="lp-place-info">
                <span className="lp-place-name">{result.place}</span>
                {result.districtName
                  ? <span className="lp-district-pill">{result.districtName} District</span>
                  : <span className="lp-no-district">Outside Kerala — please adjust pin</span>}
              </div>
            </div>
            <span className="lp-drag-hint">Drag to adjust</span>
          </div>
        )}
      </div>
    </div>
  );
}
