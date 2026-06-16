import { Camera, Loader2, MapPin, Send, X } from "lucide-react";
import { useRef, useState } from "react";
import { api } from "../api/client";

const INCIDENT_TYPES = [
  { key: "flood",    emoji: "🌊", label: "Flood" },
  { key: "landslide",emoji: "⛰️",  label: "Landslide" },
  { key: "power",    emoji: "⚡",  label: "Power Cut" },
  { key: "road",     emoji: "🚧",  label: "Road Blocked" },
  { key: "building", emoji: "🏚️",  label: "Building Damage" },
  { key: "coastal",  emoji: "🌊",  label: "Coastal" },
  { key: "safe",     emoji: "✅",  label: "Safe Now" },
  { key: "other",    emoji: "📢",  label: "Other" },
] as const;

type IncidentKey = typeof INCIDENT_TYPES[number]["key"];

type LocationState =
  | { status: "idle" }
  | { status: "fetching" }
  | { status: "ok"; lat: number; lon: number; label: string }
  | { status: "error"; message: string };

export function ShareUpdateModal({
  districtName,
  districtSlug,
  onClose,
  onSubmitted,
}: {
  districtName: string;
  districtSlug: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [incidentType, setIncidentType] = useState<IncidentKey | null>(null);
  const [content, setContent]     = useState("");
  const [name, setName]           = useState("");
  const [location, setLocation]   = useState<LocationState>({ status: "idle" });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const locationOn = location.status === "ok";

  const toggleLocation = () => {
    if (locationOn) { setLocation({ status: "idle" }); return; }
    if (!navigator.geolocation) {
      setLocation({ status: "error", message: "Geolocation not supported by this browser." });
      return;
    }
    setLocation({ status: "fetching" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = parseFloat(pos.coords.latitude.toFixed(5));
        const lon = parseFloat(pos.coords.longitude.toFixed(5));
        setLocation({ status: "ok", lat, lon, label: `${lat}, ${lon}` });
      },
      (err) => {
        const msg =
          err.code === 1 ? "Location permission denied. Allow access in browser settings."
          : err.code === 2 ? "Location unavailable. Try again in a moment."
          : "Location request timed out.";
        setLocation({ status: "error", message: msg });
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setError("Image must be 10MB or smaller."); return; }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setError(null);
  };

  const removeImage = () => {
    setImageFile(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const buildContent = (): string => {
    const typeLabel = INCIDENT_TYPES.find((t) => t.key === incidentType);
    const prefix = typeLabel ? `[${typeLabel.label}] ` : "";
    return prefix + content.trim();
  };

  const handlePost = async () => {
    if (!content.trim() || !name.trim() || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const report = await api.createReport(districtSlug, {
        reporter_name: name.trim(),
        content: buildContent(),
        location_attached: locationOn,
        latitude: location.status === "ok" ? location.lat : undefined,
        longitude: location.status === "ok" ? location.lon : undefined,
      });
      if (imageFile) {
        try { await api.uploadImage(report.id, imageFile); } catch {}
      }
      onSubmitted();
    } catch {
      setError("Failed to post update. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="share-modal" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <button className="close-button" onClick={onClose} aria-label="Close"><X size={18} /></button>

        <h2 id="share-title">Report an Incident</h2>
        <p className="modal-subtitle">Help others stay safe in {districtName}</p>

        {/* Incident type grid */}
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--t3)", marginBottom: 8 }}>
          What happened? <span style={{ fontWeight: 500, opacity: .7 }}>(optional)</span>
        </div>
        <div className="incident-grid">
          {INCIDENT_TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`incident-btn${incidentType === t.key ? " selected" : ""}`}
              onClick={() => setIncidentType(incidentType === t.key ? null : t.key)}
            >
              <span className="emoji">{t.emoji}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* Text area */}
        <textarea
          maxLength={500}
          placeholder={
            incidentType === "flood"     ? "Water level, area affected, severity..." :
            incidentType === "landslide" ? "Location, road blocked, casualties..." :
            incidentType === "power"     ? "Area affected, estimated duration..." :
            incidentType === "road"      ? "Which road, reason, alternate route..." :
            "Describe what's happening in detail..."
          }
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <div className="counter">{content.length}/500</div>

        <div className="share-row">
          <input
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {imagePreview ? (
            <div className="image-preview-wrap">
              <img src={imagePreview} alt="Preview" className="image-preview" />
              <button className="remove-image" onClick={removeImage} aria-label="Remove image">
                <X size={14} />
              </button>
            </div>
          ) : (
            <label className="upload-box">
              <Camera size={18} />
              <strong>Add Photo</strong>
              <span>Evidence helps verify</span>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileChange} />
            </label>
          )}
        </div>

        {/* Location */}
        <div className="location-row">
          <MapPin size={20} style={{ color: locationOn ? "var(--green)" : "var(--t3)", marginTop: 1 }} />
          <div style={{ flex: 1 }}>
            <strong style={{ color: locationOn ? "var(--green)" : "var(--t1)" }}>
              {locationOn ? "Location attached" : "Attach my location"}
            </strong>
            <p>
              {location.status === "idle"     && "Adds precise location to your report"}
              {location.status === "fetching" && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--blue)" }}>
                  <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
                  Getting your location…
                </span>
              )}
              {location.status === "ok"      && <span style={{ color: "var(--green)" }}>{location.label}</span>}
              {location.status === "error"   && <span style={{ color: "var(--red)", fontSize: 12 }}>{location.message}</span>}
            </p>
          </div>
          <button
            className={`toggle${locationOn ? " on" : ""}`}
            aria-label="Use my location"
            onClick={toggleLocation}
            disabled={location.status === "fetching"}
          />
        </div>

        {error && <p style={{ color: "var(--red)", fontSize: 13, margin: "6px 0 0" }}>{error}</p>}

        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose}>Cancel</button>
          <button
            className="primary-button"
            onClick={handlePost}
            disabled={submitting || !content.trim() || !name.trim()}
          >
            {submitting
              ? <><Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />Posting…</>
              : <><Send size={15} />Post Report</>}
          </button>
        </div>
      </section>
    </div>
  );
}
