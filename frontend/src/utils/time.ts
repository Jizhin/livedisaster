export function timeAgo(isoDatetime: string | null | undefined, lang: "en" | "ml" = "en"): string {
  if (!isoDatetime) return "";
  const diffMs = Date.now() - new Date(isoDatetime).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (lang === "ml") {
    if (mins < 1) return "ഇപ്പോൾ";
    if (mins < 60) return `${mins} മിനിറ്റ് മുമ്പ്`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} മണിക്കൂർ മുമ്പ്`;
    return `${Math.floor(hours / 24)} ദിവസം മുമ്പ്`;
  }
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} mins ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hrs ago`;
  return `${Math.floor(hours / 24)} days ago`;
}
