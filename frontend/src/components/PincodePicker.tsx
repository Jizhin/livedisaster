import { Check, Loader2, MapPin, X } from "lucide-react";
import { useRef, useState } from "react";

export type PinResult = {
  pincode: string;
  place: string;
  districtName: string;
  districtSlug: string;
};

/* India Post API district → slug (handles any casing from API) */
const SLUG: Record<string, string> = {
  thiruvananthapuram: "thiruvananthapuram",
  kollam: "kollam",
  pathanamthitta: "pathanamthitta",
  alappuzha: "alappuzha",
  kottayam: "kottayam",
  idukki: "idukki",
  ernakulam: "ernakulam",
  thrissur: "thrissur",
  palakkad: "palakkad",
  malappuram: "malappuram",
  kozhikode: "kozhikode",
  wayanad: "wayanad",
  kannur: "kannur",
  kasaragod: "kasaragod",
};

type Phase = "idle" | "loading" | "found" | "invalid" | "wrong_state";

export function PincodePicker({ onChange }: { onChange: (r: PinResult | null) => void }) {
  const [value,  setValue]  = useState("");
  const [phase,  setPhase]  = useState<Phase>("idle");
  const [result, setResult] = useState<PinResult | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    setValue(""); setPhase("idle"); setResult(null); onChange(null);
  };

  const lookup = async (pin: string) => {
    setPhase("loading");
    try {
      const res  = await fetch(`https://api.postalpincode.in/pincode/${pin}`);
      const data = await res.json() as Array<{ Status: string; PostOffice?: Array<{ Name: string; Block: string; District: string; State: string }> }>;
      const block = data[0];

      if (block?.Status !== "Success" || !block.PostOffice?.length) {
        setPhase("invalid"); setResult(null); onChange(null); return;
      }
      const po = block.PostOffice[0];
      if (po.State !== "Kerala") {
        setPhase("wrong_state"); setResult(null); onChange(null); return;
      }
      const distKey = po.District.toLowerCase();
      const r: PinResult = {
        pincode:      pin,
        place:        po.Name || po.Block,
        districtName: po.District,
        districtSlug: SLUG[distKey] ?? distKey,
      };
      setResult(r); setPhase("found"); onChange(r);
    } catch {
      setPhase("invalid"); setResult(null); onChange(null);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/\D/g, "").slice(0, 6);
    setValue(v);
    if (v.length < 6) {
      setPhase("idle"); setResult(null); onChange(null);
    } else {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => lookup(v), 350);
    }
  };

  const borderColor =
    phase === "found"  ? "var(--green)" :
    phase === "invalid" || phase === "wrong_state" ? "var(--red)" :
    phase === "loading" ? "var(--blue)" :
    "var(--border-md)";

  return (
    <div className="pp-wrap">
      <div className="pp-row" style={{ borderColor }}>
        <MapPin size={15} className="pp-map-icon" style={{ color: phase === "found" ? "var(--green)" : "var(--t3)" }} />
        <input
          className="pp-input"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          placeholder="6-digit pincode"
          value={value}
          onChange={handleChange}
          autoComplete="postal-code"
        />
        <span className="pp-len">{value.length}/6</span>
        {phase === "loading"  && <Loader2 size={15} style={{ color: "var(--blue)", animation: "spin 1s linear infinite", flexShrink: 0 }} />}
        {phase === "found"    && <Check   size={15} style={{ color: "var(--green)", flexShrink: 0 }} />}
        {(phase === "invalid" || phase === "wrong_state") && (
          <button className="pp-x" onClick={clear}><X size={13} /></button>
        )}
      </div>

      {phase === "found" && result && (
        <div className="pp-result">
          <span className="pp-result-emoji">📍</span>
          <span className="pp-result-place">{result.place}</span>
          <span className="pp-result-badge">{result.districtName}</span>
        </div>
      )}
      {phase === "invalid"     && <p className="pp-err">Invalid pincode — please check and try again.</p>}
      {phase === "wrong_state" && <p className="pp-err">This pincode is outside Kerala.</p>}
    </div>
  );
}
