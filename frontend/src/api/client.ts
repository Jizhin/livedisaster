import type { District, NewsReport, OfficialAlert, Report, StatsResult, VerificationCounts } from "../types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api";
const UPLOADS_ORIGIN = API_BASE.replace(/\/api$/, "");

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status}: POST ${path}`);
  return res.json() as Promise<T>;
}

export function imageUrl(filePath: string): string {
  return `${UPLOADS_ORIGIN}/uploads/${filePath}`;
}

export const api = {
  districts: () => getJson<District[]>("/districts"),

  recentReports: (limit = 6) =>
    getJson<Report[]>(`/reports/recent?limit=${limit}`),

  districtReports: (slug: string, sort = "newest", dateFilter = "today") =>
    getJson<Report[]>(`/districts/${slug}/reports?sort=${sort}&date_filter=${dateFilter}`),

  districtAlerts: (slug: string) =>
    getJson<OfficialAlert[]>(`/districts/${slug}/alerts`),

  activeAlerts: (limit = 20) =>
    getJson<OfficialAlert[]>(`/alerts/active?limit=${limit}`),

  reportDetail: (id: number) =>
    getJson<Report>(`/reports/${id}`),

  createReport: (
    slug: string,
    payload: {
      reporter_name: string;
      content: string;
      location_attached?: boolean;
      latitude?: number | null;
      longitude?: number | null;
      locality?: string | null;
      state?: string | null;
      country?: string | null;
      pincode?: string | null;
    }
  ) => postJson<Report>(`/districts/${slug}/reports`, payload),

  addComment: (reportId: number, payload: { author_name: string; content: string }) =>
    postJson<Report>(`/reports/${reportId}/comments`, payload),

  viewReport: (reportId: number) =>
    postJson<Report>(`/reports/${reportId}/view`, {}),

  verify: (
    reportId: number,
    kind: "confirm" | "incorrect" | "resolved",
    voterName?: string
  ) =>
    postJson<VerificationCounts>(`/reports/${reportId}/verifications`, {
      kind,
      voter_name: voterName ?? null,
    }),

  districtNews: (slug: string, limit = 30) =>
    getJson<NewsReport[]>(`/districts/${slug}/news?limit=${limit}`),

  recentNews: (limit = 10) =>
    getJson<NewsReport[]>(`/news/recent?limit=${limit}`),

  stats: (params: { locality?: string; districtSlug?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.locality)     qs.set("locality",      params.locality);
    if (params.districtSlug) qs.set("district_slug", params.districtSlug);
    return getJson<StatsResult>(`/stats?${qs.toString()}`);
  },

  uploadImage: async (reportId: number, file: File): Promise<void> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_BASE}/reports/${reportId}/images`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) throw new Error(`Image upload failed: ${res.status}`);
  },
};
