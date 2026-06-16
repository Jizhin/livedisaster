import { useEffect, useRef } from "react";
import type { District, OfficialAlert } from "../types";

declare var L: any;

const DISTRICT_COORDS: Record<string, [number, number]> = {
  thiruvananthapuram: [8.5241,  76.9366],
  kollam:             [8.8932,  76.6141],
  pathanamthitta:     [9.2648,  76.7870],
  alappuzha:          [9.4981,  76.3388],
  kottayam:           [9.5916,  76.5222],
  idukki:             [9.9189,  76.9705],
  ernakulam:          [9.9312,  76.2673],
  thrissur:           [10.5276, 76.2144],
  palakkad:           [10.7867, 76.6548],
  malappuram:         [11.0510, 76.0711],
  kozhikode:          [11.2588, 75.7804],
  wayanad:            [11.6854, 76.1320],
  kannur:             [11.8745, 75.3704],
  kasaragod:          [12.4996, 74.9869],
};

// Simplified Kerala state border polygon
const KERALA_BORDER: [number, number][] = [
  [12.78, 75.23], [12.47, 75.00], [12.30, 74.88], [12.10, 75.02],
  [11.86, 75.37], [11.60, 75.55], [11.25, 75.78], [11.05, 75.84],
  [10.85, 75.93], [10.53, 76.21], [10.10, 76.20], [9.93,  76.26],
  [9.50,  76.33], [9.19,  76.35], [8.89,  76.59], [8.52,  76.88],
  [8.25,  76.97], [8.07,  77.08], [8.20,  77.30], [8.52,  77.52],
  [8.72,  77.52], [9.25,  77.30], [9.85,  77.10], [10.35, 76.88],
  [10.78, 76.68], [11.15, 76.10], [11.52, 76.02], [11.68, 76.14],
  [11.85, 76.10], [12.00, 75.90], [12.10, 75.50], [12.47, 75.22],
  [12.78, 75.23],
];

const DISTRICT_NAMES: Record<string, string> = {
  thiruvananthapuram: "THIRUVANANTHAPURAM",
  kollam:             "KOLLAM",
  pathanamthitta:     "PATHANAMTHITTA",
  alappuzha:          "ALAPPUZHA",
  kottayam:           "KOTTAYAM",
  idukki:             "IDUKKI",
  ernakulam:          "ERNAKULAM",
  thrissur:           "THRISSUR",
  palakkad:           "PALAKKAD",
  malappuram:         "MALAPPURAM",
  kozhikode:          "KOZHIKODE",
  wayanad:            "WAYANAD",
  kannur:             "KANNUR",
  kasaragod:          "KASARAGOD",
};

function markerClass(district: District, alerts: OfficialAlert[]): string {
  const alert = alerts.find((a) => a.district_slug === district.slug);
  if (alert?.severity === "red" || district.active_reports_count >= 5) return "cm-critical";
  if (district.active_reports_count > 0) return "cm-active";
  return "cm-calm";
}

function markerColor(district: District, alerts: OfficialAlert[]): string {
  const alert = alerts.find((a) => a.district_slug === district.slug);
  if (alert?.severity === "red" || district.active_reports_count >= 5) return "#b91c1c";
  if (district.active_reports_count > 0) return "#dc2626";
  return "#16a34a";
}

function markerRadius(district: District, alerts: OfficialAlert[]): number {
  const alert = alerts.find((a) => a.district_slug === district.slug);
  if (alert?.severity === "red" || district.active_reports_count >= 5) return 7;
  if (district.active_reports_count > 0) return 6;
  return 4;
}

const KERALA_CENTER: [number, number] = [10.52, 76.27];
const KERALA_ZOOM = 7;

function focusKerala(map: any) {
  map.invalidateSize();
  map.setView(KERALA_CENTER, KERALA_ZOOM, { animate: false });
}

export function DistrictMap({
  districts,
  alerts,
}: {
  districts: District[];
  alerts: OfficialAlert[];
}) {
  const mapRef   = useRef<any>(null);
  const layerRef = useRef<any>(null);

  useEffect(() => {
    if (typeof L === "undefined" || mapRef.current) return;

    mapRef.current = L.map("kerala-map", {
      center: KERALA_CENTER,
      zoom: KERALA_ZOOM,
      zoomControl: false,
      attributionControl: false,
      maxBounds: [[7.0, 74.5], [13.5, 78.0]],
      maxBoundsViscosity: 1.0,
      minZoom: 6,
      maxZoom: 15,
    });

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
      { subdomains: "abcd", maxZoom: 15, attribution: "© OpenStreetMap © CARTO" }
    ).addTo(mapRef.current);

    // Re-center after container settles
    setTimeout(() => focusKerala(mapRef.current), 100);
    setTimeout(() => focusKerala(mapRef.current), 500);

    // ── Kerala State Border — clean solid on light map ────
    // Layer 1: subtle soft area fill
    L.polygon(KERALA_BORDER, {
      color: "#b91c1c",
      weight: 0,
      opacity: 0,
      fillOpacity: 0.06,
      fillColor: "#dc2626",
      interactive: false,
    }).addTo(mapRef.current);

    // Layer 2: soft outer stroke
    L.polygon(KERALA_BORDER, {
      color: "#dc2626",
      weight: 8,
      opacity: 0.12,
      fillOpacity: 0,
      interactive: false,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(mapRef.current);

    // Layer 3: main visible border
    L.polygon(KERALA_BORDER, {
      color: "#b91c1c",
      weight: 2.5,
      opacity: 0.85,
      fillOpacity: 0,
      interactive: false,
      lineCap: "round",
      lineJoin: "round",
      className: "kerala-border-line",
    }).addTo(mapRef.current);

    // ── District name labels ──────────────────────────────
    Object.entries(DISTRICT_COORDS).forEach(([slug, [lat, lon]]) => {
      const name = DISTRICT_NAMES[slug] ?? slug.toUpperCase();
      const icon = L.divIcon({
        className: "",
        html: `<div class="dl-wrap"><span class="dl-text">${name}</span></div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      L.marker([lat, lon], {
        icon,
        interactive: false,
        keyboard: false,
        zIndexOffset: -200,
      }).addTo(mapRef.current);
    });

    L.control.zoom({ position: "bottomright" }).addTo(mapRef.current);
    L.control.attribution({ position: "bottomright", prefix: "Leaflet" })
      .addAttribution('© <a href="https://www.openstreetmap.org/copyright" style="color:#555">OpenStreetMap</a> | <a href="https://carto.com" style="color:#555">CARTO</a>')
      .addTo(mapRef.current);

    layerRef.current = L.layerGroup().addTo(mapRef.current);
  }, []);

  useEffect(() => {
    if (!mapRef.current || !layerRef.current || typeof L === "undefined") return;
    layerRef.current.clearLayers();

    districts.forEach((d) => {
      const coords = DISTRICT_COORDS[d.slug];
      if (!coords) return;
      const color  = markerColor(d, alerts);
      const radius = markerRadius(d, alerts);
      const cls    = markerClass(d, alerts);

      const circle = L.circleMarker(coords, {
        radius,
        fillColor: color,
        fillOpacity: 0.9,
        color: "#ffffff",
        weight: 2,
        className: cls,
        interactive: true,
      });

      circle.bindPopup(
        `<div style="min-width:148px">
           <div style="font-weight:800;font-size:14px;color:#0d1117;margin-bottom:3px">${d.name}</div>
           <div style="font-size:12px;color:#64748b;margin-bottom:10px">
             ${d.active_reports_count} active report${d.active_reports_count !== 1 ? "s" : ""}
           </div>
           <a href="/district/${d.slug}"
              style="display:block;text-align:center;background:#dc2626;color:#fff;
                     font-size:12px;font-weight:700;padding:7px 12px;border-radius:8px;
                     text-decoration:none">
             View Reports →
           </a>
         </div>`,
        { maxWidth: 190 }
      );

      circle.addTo(layerRef.current);
    });
  }, [districts, alerts]);

  return (
    <div
      id="kerala-map"
      style={{ width: "100%", height: "100%", minHeight: "100%" }}
    />
  );
}
