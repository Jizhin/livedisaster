export type Status = "new" | "verified" | "disputed" | "resolved";

export interface District {
  id: number;
  name: string;
  slug: string;
  is_active: boolean;
  active_reports_count: number;
  latest_activity: string | null;
  latest_activity_time: string | null; // ISO datetime
}

export interface ImageRead {
  id: number;
  file_path: string;
  alt_text: string | null;
}

export interface Comment {
  id: number;
  report_id: number;
  author_name: string;
  content: string;
  created_at: string; // ISO datetime
}

export interface Report {
  id: number;
  district_id: number;
  district_slug: string | null;
  district_name: string | null;
  reporter_name: string;
  content: string;
  status: Status;
  location_attached: boolean;
  latitude: number | null;
  longitude: number | null;
  locality: string | null;
  state: string | null;
  country: string | null;
  pincode: string | null;
  created_at: string; // ISO datetime
  updated_at: string;
  images: ImageRead[];
  confirmed_count: number;
  incorrect_count: number;
  resolved_count: number;
  comment_count: number;
  views_count: number;
  comments?: Comment[];
  source_type: "community" | "news";
  source_url: string | null;
}

export interface OfficialAlert {
  id: number;
  district_id: number;
  district_slug: string | null;
  district_name: string | null;
  title: string;
  content: string;
  source: string;
  severity: string;
  is_active: boolean;
  created_at: string;
}

export interface VerificationCounts {
  confirmed_count: number;
  incorrect_count: number;
  resolved_count: number;
}

export interface StatsResult {
  active_alerts: number;
  safe_updates: number;
  contributors: number;
  today_alerts: number;
  today_safe: number;
  district?: {
    active_alerts: number;
    safe_updates: number;
    contributors: number;
    today_alerts: number;
    today_safe: number;
  };
}

export interface NewsReport {
  id: number;
  district_id: number;
  district_slug: string | null;
  district_name: string | null;
  title: string;
  content: string | null;
  source_url: string;
  image_url: string | null;
  source_name: string;
  severity: string | null;
  created_at: string;
}

