import { Check, Flag, X } from "lucide-react";
import type { Report } from "../types";

export function VerificationButtons({ report, compact = false }: { report: Report; compact?: boolean }) {
  return (
    <div className={compact ? "verify-row compact" : "verify-row"}>
      <span><Check size={18} /> <strong>{report.confirmed_count}</strong>{!compact && <small>Confirmed</small>}</span>
      <span><X size={18} /> <strong>{report.incorrect_count}</strong>{!compact && <small>Incorrect</small>}</span>
      <span><Flag size={18} /> <strong>{report.resolved_count}</strong>{!compact && <small>Resolved</small>}</span>
    </div>
  );
}

