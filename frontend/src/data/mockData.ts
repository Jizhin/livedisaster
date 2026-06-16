import type { District, OfficialAlert, Report } from "../types";

export const districtList: District[] = [
  { id: 1, name: "Kannur", slug: "kannur", active_reports_count: 81, latest_activity: "Power gone near Taliparamba", latest_activity_time: "2 mins ago" },
  { id: 2, name: "Kozhikode", slug: "kozhikode", active_reports_count: 54, latest_activity: "Waterlogging near highway", latest_activity_time: "5 mins ago" },
  { id: 3, name: "Kasaragod", slug: "kasaragod", active_reports_count: 32, latest_activity: "Heavy rain in several areas", latest_activity_time: "8 mins ago" },
  { id: 4, name: "Wayanad", slug: "wayanad", active_reports_count: 27, latest_activity: "Tree fallen near Meppadi", latest_activity_time: "10 mins ago" },
  { id: 5, name: "Malappuram", slug: "malappuram", active_reports_count: 46, latest_activity: "Water entering houses", latest_activity_time: "4 mins ago" },
  { id: 6, name: "Thrissur", slug: "thrissur", active_reports_count: 63, latest_activity: "Traffic moving slow near Poonkunnam", latest_activity_time: "7 mins ago" },
  { id: 7, name: "Ernakulam", slug: "ernakulam", active_reports_count: 68, latest_activity: "Waterlogging in low areas", latest_activity_time: "3 mins ago" },
  { id: 8, name: "Kottayam", slug: "kottayam", active_reports_count: 29, latest_activity: "Light poles not working", latest_activity_time: "12 mins ago" },
  { id: 9, name: "Alappuzha", slug: "alappuzha", active_reports_count: 41, latest_activity: "Rainwater entering homes", latest_activity_time: "6 mins ago" },
  { id: 10, name: "Pathanamthitta", slug: "pathanamthitta", active_reports_count: 22, latest_activity: "Landslide reported near hill area", latest_activity_time: "15 mins ago" },
  { id: 11, name: "Idukki", slug: "idukki", active_reports_count: 18, latest_activity: "Road blocked due to tree fall", latest_activity_time: "18 mins ago" },
  { id: 12, name: "Kollam", slug: "kollam", active_reports_count: 38, latest_activity: "Power fluctuations in many areas", latest_activity_time: "9 mins ago" }
];

const photos = [
  "https://images.unsplash.com/photo-1518467166778-b88f373ffec7?auto=format&fit=crop&w=500&q=80",
  "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=500&q=80",
  "https://images.unsplash.com/photo-1449824913935-59a10b8d2000?auto=format&fit=crop&w=500&q=80",
  "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=500&q=80"
];

export const reports: Report[] = [
  {
    id: 1,
    districtSlug: "kannur",
    districtName: "Kannur",
    reporter_name: "Arun",
    content: "Power gone near Taliparamba bus stand.",
    status: "new",
    createdLabel: "2 mins ago",
    confirmed_count: 12,
    incorrect_count: 1,
    resolved_count: 0,
    comment_count: 4,
    image: photos[0],
    comments: [
      { id: 1, author_name: "Suresh", content: "Still no power.", createdLabel: "8 mins ago" },
      { id: 2, author_name: "Anjali", content: "Electricity restored near market area.", createdLabel: "5 mins ago" },
      { id: 3, author_name: "Rahul", content: "Still unavailable near bus stand.", createdLabel: "2 mins ago" }
    ]
  },
  {
    id: 2,
    districtSlug: "kannur",
    districtName: "Kannur",
    reporter_name: "Niharika",
    content: "Water entering houses in low areas near Madayippara.",
    status: "new",
    createdLabel: "3 mins ago",
    confirmed_count: 7,
    incorrect_count: 0,
    resolved_count: 0,
    comment_count: 2,
    image: photos[1],
    comments: []
  },
  {
    id: 3,
    districtSlug: "kannur",
    districtName: "Kannur",
    reporter_name: "Jishnu",
    content: "Tree fallen near airport road, traffic moving slow.",
    status: "verified",
    createdLabel: "8 mins ago",
    confirmed_count: 22,
    incorrect_count: 0,
    resolved_count: 0,
    comment_count: 1,
    image: photos[2],
    comments: []
  },
  {
    id: 4,
    districtSlug: "kannur",
    districtName: "Kannur",
    reporter_name: "Rahul",
    content: "Loud sound heard near Thavakkara. People unsure.",
    status: "disputed",
    createdLabel: "11 mins ago",
    confirmed_count: 5,
    incorrect_count: 3,
    resolved_count: 0,
    comment_count: 5,
    comments: []
  },
  {
    id: 5,
    districtSlug: "kannur",
    districtName: "Kannur",
    reporter_name: "Sreejith",
    content: "Road cleared near Mattannur bridge.",
    status: "resolved",
    createdLabel: "18 mins ago",
    confirmed_count: 15,
    incorrect_count: 0,
    resolved_count: 9,
    comment_count: 3,
    image: photos[3],
    comments: []
  },
  {
    id: 6,
    districtSlug: "kannur",
    districtName: "Kannur",
    reporter_name: "Arun",
    content: "Waterlogging near Chala market.",
    status: "new",
    createdLabel: "21 mins ago",
    confirmed_count: 6,
    incorrect_count: 1,
    resolved_count: 0,
    comment_count: 1,
    image: photos[0],
    comments: []
  }
];

export const officialAlerts: Record<string, OfficialAlert[]> = {
  kannur: [
    {
      id: 1,
      title: "Orange Alert",
      content: "Heavy rainfall warning for Kannur district.",
      source: "District Collector",
      severity: "orange"
    }
  ]
};

