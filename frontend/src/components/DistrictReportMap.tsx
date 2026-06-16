import { useEffect, useRef } from "react";
import type { Report } from "../types";

declare var L: any;

const DISTRICT_CENTER: Record<string, [number, number]> = {
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

const isSafe = (r: Report) => r.content.toLowerCase().includes("[safe now]");

export function DistrictReportMap({
  districtSlug,
  reports,
  onSelectReport,
}: {
  districtSlug: string;
  reports: Report[];
  onSelectReport: (r: Report) => void;
}) {
  const mapRef   = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const cbRef    = useRef(onSelectReport);
  cbRef.current  = onSelectReport;

  useEffect(() => {
    if (typeof L === "undefined" || mapRef.current) return;

    const center = DISTRICT_CENTER[districtSlug] ?? [10.85, 76.27];

    mapRef.current = L.map("drm-map", {
      center,
      zoom: 10,
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: false,
    });

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
      { subdomains: "abcd", maxZoom: 18, attribution: "© OpenStreetMap © CARTO" }
    ).addTo(mapRef.current);

    L.control.zoom({ position: "bottomright" }).addTo(mapRef.current);

    layerRef.current = L.layerGroup().addTo(mapRef.current);

    setTimeout(() => mapRef.current?.invalidateSize(), 100);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapRef.current || !layerRef.current || typeof L === "undefined") return;
    layerRef.current.clearLayers();

    const located = reports.filter(r => r.latitude && r.longitude);

    located.forEach(r => {
      const safe = isSafe(r);
      const resolved = r.status === "resolved";
      const color = resolved ? "#9CA3AF" : safe ? "#16A34A" : "#DC2626";
      const text  = r.content.replace(/^\[.*?\]\s*/, "").trim();

      const marker = L.circleMarker([r.latitude!, r.longitude!], {
        radius: 8,
        fillColor: color,
        fillOpacity: 0.9,
        color: "#fff",
        weight: 2,
      });

      marker.bindPopup(
        `<div style="min-width:160px;font-family:system-ui">
           <div style="font-weight:700;font-size:13px;color:#111;margin-bottom:4px;line-height:1.3">
             ${text.length > 60 ? text.slice(0, 60) + "…" : text}
           </div>
           ${r.locality ? `<div style="font-size:11px;color:#6B7280;margin-bottom:8px">📍 ${r.locality}</div>` : ""}
           <button
             onclick="document.dispatchEvent(new CustomEvent('drm-open',{detail:${r.id}}))"
             style="width:100%;background:#111827;color:#fff;border:none;border-radius:8px;
                    padding:7px;font-size:12px;font-weight:700;cursor:pointer">
             View Discussion →
           </button>
         </div>`,
        { maxWidth: 200 }
      );

      marker.addTo(layerRef.current);
    });

    if (located.length === 0) {
      const center = DISTRICT_CENTER[districtSlug];
      if (center) {
        L.circleMarker(center, {
          radius: 10,
          fillColor: "#DC2626",
          fillOpacity: 0.3,
          color: "#DC2626",
          weight: 2,
          dashArray: "4 4",
        }).addTo(layerRef.current);
      }
    }
  }, [reports, districtSlug]);

  useEffect(() => {
    const handler = (e: any) => {
      const report = reports.find(r => r.id === e.detail);
      if (report) cbRef.current(report);
    };
    document.addEventListener("drm-open", handler);
    return () => document.removeEventListener("drm-open", handler);
  }, [reports]);

  return <div id="drm-map" style={{ width: "100%", height: "100%" }} />;
}
