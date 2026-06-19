import { useState, useRef, useEffect, useCallback } from 'react'

/* ── Leaflet map with draggable / click-to-place marker ───────── */
declare global { interface Window { L: any } }

function LocationMap({ lat, lng, onMove }: { lat: number; lng: number; onMove: (lat: number, lng: number) => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const isDragging = useRef(false)
  const onMoveRef = useRef(onMove)
  onMoveRef.current = onMove

  useEffect(() => {
    if (!containerRef.current) return
    const L = window.L
    if (!L) { console.warn('Leaflet not loaded'); return }

    delete (L.Icon.Default.prototype as any)._getIconUrl
    L.Icon.Default.mergeOptions({
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    })

    const map = L.map(containerRef.current, {
      center: [lat, lng], zoom: 16,
      scrollWheelZoom: false,
      attributionControl: true,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      maxZoom: 19,
    }).addTo(map)

    const marker = L.marker([lat, lng], { draggable: true }).addTo(map)

    marker.on('dragstart', () => { isDragging.current = true })
    marker.on('dragend', (e: any) => {
      const p = e.target.getLatLng()
      onMoveRef.current(p.lat, p.lng)
      setTimeout(() => { isDragging.current = false }, 100)
    })
    map.on('click', (e: any) => {
      marker.setLatLng(e.latlng)
      onMoveRef.current(e.latlng.lat, e.latlng.lng)
    })

    mapRef.current = map
    markerRef.current = marker

    // Force Leaflet to recalculate size after modal animation settles
    const t = setTimeout(() => map.invalidateSize(), 320)

    return () => {
      clearTimeout(t)
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isDragging.current || !mapRef.current || !markerRef.current) return
    mapRef.current.setView([lat, lng], 16)
    markerRef.current.setLatLng([lat, lng])
  }, [lat, lng])

  return (
    // Outer wrapper clips border-radius; inner div is the actual Leaflet container
    <div style={{ borderRadius: 14, overflow: 'hidden', height: 200, border: '1.5px solid #E7D8C7' }}>
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
    </div>
  )
}
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createSpot } from '../api/client'
import { useLanguage } from '../context/LanguageContext'

interface Props {
  open: boolean
  onClose: () => void
  initialDistrict?: string
}

const KERALA_DISTRICTS = [
  'Kasaragod', 'Kannur', 'Wayanad', 'Kozhikode', 'Malappuram',
  'Palakkad', 'Thrissur', 'Ernakulam', 'Idukki', 'Kottayam',
  'Alappuzha', 'Pathanamthitta', 'Kollam', 'Thiruvananthapuram',
]

function detectDistrict(displayName: string): string | null {
  const lower = displayName.toLowerCase()
  return KERALA_DISTRICTS.find((d) => lower.includes(d.toLowerCase())) ?? null
}

const backdropStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 1000,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  backgroundColor: 'rgba(24,24,27,0.55)',
  backdropFilter: 'blur(6px)',
  WebkitBackdropFilter: 'blur(6px)',
  padding: '20px',
}

const cardStyle: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  maxWidth: 720,
  maxHeight: '90vh',
  borderRadius: 36,
  backgroundColor: '#FAF7F2',
  boxShadow: '0 25px 80px rgba(0,0,0,0.12)',
  padding: '32px 40px 40px',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: 'Manrope, "Noto Sans Malayalam", sans-serif',
}

export default function ShareModal({ open, onClose, initialDistrict }: Props) {
  const { t } = useLanguage()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [description, setDescription] = useState('')
  const [locationSearch, setLocationSearch] = useState('')
  const [locationDescribe, setLocationDescribe] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [geoLat, setGeoLat] = useState<number | null>(null)
  const [geoLng, setGeoLng] = useState<number | null>(null)
  const [geoStatus, setGeoStatus] = useState<'idle' | 'loading' | 'ok'>('idle')
  const [submitted, setSubmitted] = useState(false)

  type GeoResult = { place_id: string; display_name: string; lat: string; lon: string }
  const [searchResults, setSearchResults] = useState<GeoResult[]>([])
  const [searching, setSearching] = useState(false)
  const [geoDistrict, setGeoDistrict] = useState<string | null>(initialDistrict ?? null)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open) return
    setDescription('')
    setLocationSearch('')
    setLocationDescribe('')
    setImageFile(null)
    setImagePreview(null)
    setGeoLat(null)
    setGeoLng(null)
    setGeoStatus('idle')
    setSubmitted(false)
    setSearchResults([])
    setSearching(false)
    setGeoDistrict(initialDistrict ?? null)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const mutation = useMutation({
    mutationFn: (fd: FormData) => createSpot(fd),
    onSuccess: () => {
      setSubmitted(true)
      qc.invalidateQueries({ queryKey: ['spots'] })
      qc.invalidateQueries({ queryKey: ['districts'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    },
  })

  const pickImage = useCallback((file: File) => {
    setImageFile(file)
    const reader = new FileReader()
    reader.onload = (e) => setImagePreview(e.target?.result as string ?? null)
    reader.readAsDataURL(file)
  }, [])

  const handleGeo = () => {
    if (!navigator.geolocation || geoStatus === 'loading') return
    setGeoStatus('loading')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoLat(pos.coords.latitude)
        setGeoLng(pos.coords.longitude)
        setGeoStatus('ok')
      },
      () => setGeoStatus('idle'),
      { timeout: 8000 }
    )
  }

  const handleLocationSearch = (value: string) => {
    setLocationSearch(value)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    if (value.trim().length < 3) {
      setSearchResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(value)}&format=json&limit=10&countrycodes=in&addressdetails=0&accept-language=en`
        const res = await fetch(url, { headers: { 'User-Agent': 'FoodSpotUndo/1.0 (jisprofessional2@gmail.com)' } })
        const data: GeoResult[] = await res.json()
        setSearchResults(data)
      } catch {
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }, 420)
  }

  const selectResult = (r: GeoResult) => {
    const name = r.display_name.split(',').slice(0, 3).join(', ').trim()
    setLocationSearch(name)
    setGeoLat(parseFloat(r.lat))
    setGeoLng(parseFloat(r.lon))
    setGeoStatus('ok')
    setSearchResults([])
    const detected = detectDistrict(r.display_name)
    if (detected) setGeoDistrict(detected)
  }

  const canSubmit =
    description.trim().length > 0 &&
    (locationSearch.trim().length > 0 || locationDescribe.trim().length > 0)

  const handleSubmit = () => {
    if (!canSubmit || mutation.isPending) return
    const fd = new FormData()
    fd.append('title', description.trim().slice(0, 80))
    fd.append('description', description.trim())
    if (imageFile) fd.append('image', imageFile)
    const locText = locationSearch.trim() || locationDescribe.trim()
    fd.append('location_text', locText)
    if (geoLat !== null) fd.append('latitude', String(geoLat))
    if (geoLng !== null) fd.append('longitude', String(geoLng))
    if (geoDistrict) fd.append('district', geoDistrict)
    mutation.mutate(fd)
  }

  if (!open) return null

  const inputBase: React.CSSProperties = {
    width: '100%',
    border: '1.5px solid #E7E5E4',
    borderRadius: 16,
    fontSize: 15,
    fontWeight: 500,
    color: '#18181B',
    backgroundColor: 'white',
    outline: 'none',
    fontFamily: 'Manrope, "Noto Sans Malayalam", sans-serif',
    boxSizing: 'border-box',
    transition: 'border-color 0.18s',
  }

  /* ── SUCCESS ───────────────────────────────────────────────── */
  if (submitted) {
    return (
      <div style={backdropStyle} onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div
          style={{
            ...cardStyle,
            maxWidth: 480,
            alignItems: 'center',
            textAlign: 'center',
            gap: 20,
            padding: '64px 40px',
          }}
        >
          <div
            style={{
              width: 88, height: 88, borderRadius: '50%',
              background: 'linear-gradient(155deg, #F59E0B, #C2410C)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 12px 40px rgba(194,65,12,0.25)',
              flexShrink: 0,
            }}
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div style={{ fontSize: 30, fontWeight: 800, color: '#18181B' }}>{t.success_title}</div>
          <div style={{ fontSize: 17, color: '#78716C', fontWeight: 500, maxWidth: 300 }}>{t.success_sub}</div>
          <button
            onClick={onClose}
            style={{
              height: 56, padding: '0 44px', borderRadius: 9999,
              background: 'linear-gradient(135deg, #F97316, #EA580C)',
              border: 'none', cursor: 'pointer',
              fontWeight: 700, fontSize: 16, color: 'white',
              fontFamily: 'Manrope, "Noto Sans Malayalam", sans-serif',
              letterSpacing: '0.04em',
              boxShadow: '0 12px 32px rgba(234,88,12,0.25)',
            }}
          >
            {t.success_close}
          </button>
        </div>
      </div>
    )
  }

  /* ── MAIN MODAL ─────────────────────────────────────────────── */
  return (
    <div style={backdropStyle} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={cardStyle} className="fs-modal-card">

        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28, flexShrink: 0 }}>
          <div style={{ width: 80, height: 8, borderRadius: 4, backgroundColor: '#D6D0C8' }} />
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute', top: 24, right: 24,
            width: 56, height: 56, borderRadius: '50%',
            background: 'white', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 12px rgba(0,0,0,0.09)',
            color: '#44403C',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Header icon */}
        <div style={{ textAlign: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 48, lineHeight: 1, display: 'inline-block' }}>🍽️</span>
        </div>

        {/* Title — two-tone */}
        <div style={{ textAlign: 'center', lineHeight: 1.2, marginBottom: 10 }}>
          <div style={{ fontSize: 'clamp(1.75rem, 4.5vw, 3.375rem)', fontWeight: 800, color: '#18181B' }}>
            {t.modal_title1}
          </div>
          <div style={{ fontSize: 'clamp(1.75rem, 4.5vw, 3.375rem)', fontWeight: 800, color: '#C2410C' }}>
            {t.modal_title2}
          </div>
        </div>

        {/* Subtitle */}
        <p
          style={{
            margin: '0 0 32px',
            textAlign: 'center',
            fontSize: 'clamp(1rem, 2.2vw, 1.5rem)',
            fontWeight: 500,
            color: '#78716C',
          }}
        >
          {t.modal_sub}
        </p>

        {/* ── Photo upload ──────────────────────────────── */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) pickImage(f)
            e.target.value = ''
          }}
        />

        <div
          onClick={() => fileRef.current?.click()}
          style={{
            position: 'relative',
            border: '2px dashed #E7D8C7',
            borderRadius: 20,
            height: 140,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'stretch',
            overflow: 'hidden',
            backgroundColor: 'white',
            marginBottom: 24,
            transition: 'border-color 0.2s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#D97706' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E7D8C7' }}
        >
          {imagePreview ? (
            <>
              <img src={imagePreview} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <button
                onClick={(e) => { e.stopPropagation(); setImageFile(null); setImagePreview(null) }}
                style={{
                  position: 'absolute', top: 10, right: 10,
                  width: 32, height: 32, borderRadius: '50%',
                  background: 'rgba(0,0,0,0.55)', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </>
          ) : (
            <>
              {/* Left — camera + text */}
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 18, padding: '0 28px' }}>
                <div
                  style={{
                    width: 60, height: 60, borderRadius: '50%',
                    background: '#F4E6D8', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 17, color: '#18181B' }}>{t.add_photo}</div>
                  <div style={{ fontSize: 13, color: '#A8A29E', marginTop: 4 }}>{t.tap_upload}</div>
                </div>
              </div>
              {/* Right — decorative Kerala food image */}
              <div
                style={{
                  width: 110,
                  flexShrink: 0,
                  backgroundImage: 'url(/hero-food-background.png)',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  opacity: 0.78,
                }}
              />
            </>
          )}
        </div>

        {/* ── Description ──────────────────────────────── */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <label style={{ fontSize: 15, fontWeight: 700, color: '#18181B' }}>
              {t.what_label}
            </label>
            <span style={{ fontSize: 12, color: '#A8A29E', fontWeight: 600 }}>
              {t.what_chars(description.length)}
            </span>
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 80))}
            placeholder={t.what_ph}
            style={{
              ...inputBase,
              height: 120,
              padding: '14px 20px',
              resize: 'none',
              lineHeight: 1.6,
              display: 'block',
            }}
            onFocus={(e) => { e.target.style.borderColor = '#D97706' }}
            onBlur={(e) => { e.target.style.borderColor = '#E7E5E4' }}
          />
        </div>

        {/* ── Location ─────────────────────────────────── */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <label style={{ fontSize: 15, fontWeight: 700, color: '#18181B' }}>
              {t.where_label}
            </label>
            <button
              onClick={handleGeo}
              disabled={geoStatus === 'loading'}
              style={{
                background: 'none', border: 'none', padding: 0,
                cursor: geoStatus === 'loading' ? 'default' : 'pointer',
                fontSize: 13, fontWeight: 700,
                color: geoStatus === 'ok' ? '#16A34A' : '#C2410C',
                fontFamily: 'Manrope, "Noto Sans Malayalam", sans-serif',
              }}
            >
              {geoStatus === 'loading'
                ? t.locating
                : geoStatus === 'ok'
                ? `✓ ${t.location_saved}`
                : `📍 ${t.use_location}`}
            </button>
          </div>

          {/* Place search */}
          <div style={{ position: 'relative', marginBottom: 4 }}>
            {/* Search icon or spinner */}
            <div style={{ position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)', color: '#A8A29E', pointerEvents: 'none', zIndex: 1 }}>
              {searching ? (
                <div
                  className="animate-spin"
                  style={{
                    width: 16, height: 16,
                    border: '2px solid #E7D8C7',
                    borderTop: '2px solid #C2410C',
                    borderRadius: '50%',
                  }}
                />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              )}
            </div>
            <input
              type="text"
              value={locationSearch}
              onChange={(e) => handleLocationSearch(e.target.value)}
              placeholder={t.place_ph}
              style={{ ...inputBase, height: 72, padding: '0 20px 0 48px' }}
              onFocus={(e) => { e.target.style.borderColor = '#D97706' }}
              onBlur={(e) => {
                e.target.style.borderColor = '#E7E5E4'
                setTimeout(() => setSearchResults([]), 150)
              }}
            />
            {/* Results dropdown */}
            {searchResults.length > 0 && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 50,
                backgroundColor: 'white',
                border: '1.5px solid #E7D8C7',
                borderRadius: 16,
                boxShadow: '0 8px 32px rgba(0,0,0,0.10)',
                overflow: 'hidden',
              }}>
                {searchResults.map((r) => {
                  const parts = r.display_name.split(',')
                  const primary = parts[0].trim()
                  const secondary = parts.slice(1, 3).join(',').trim()
                  return (
                    <div
                      key={r.place_id}
                      onMouseDown={(e) => { e.preventDefault(); selectResult(r) }}
                      style={{
                        padding: '12px 20px',
                        cursor: 'pointer',
                        borderBottom: '1px solid #F5F0E8',
                        transition: 'background 0.12s',
                        display: 'flex', alignItems: 'flex-start', gap: 12,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#FDF8F0' }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'white' }}
                    >
                      <span style={{ fontSize: 16, marginTop: 1, flexShrink: 0 }}>📍</span>
                      <div style={{ overflow: 'hidden' }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#18181B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {primary}
                        </div>
                        {secondary && (
                          <div style={{ fontSize: 12, color: '#A8A29E', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {secondary}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Map — shown when a location is pinned */}
          {geoLat !== null && geoLng !== null && (
            <div style={{ marginTop: 12, marginBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <svg width="12" height="15" viewBox="0 0 10 13" fill="#EA580C">
                  <path d="M5 0C2.24 0 0 2.24 0 5c0 3.75 5 8 5 8s5-4.25 5-8c0-2.76-2.24-5-5-5z" />
                  <circle cx="5" cy="5" r="1.8" fill="white" />
                </svg>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#18181B' }}>Adjust exact location</span>
                <span style={{ fontSize: 12, color: '#A8A29E' }}>· drag pin or tap map</span>
              </div>
              <LocationMap
                lat={geoLat}
                lng={geoLng}
                onMove={(lat, lng) => { setGeoLat(lat); setGeoLng(lng) }}
              />
            </div>
          )}

          {/* OR divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '14px 0' }}>
            <div style={{ flex: 1, height: 1, background: '#E7E5E4' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#A8A29E', letterSpacing: '0.08em' }}>OR</span>
            <div style={{ flex: 1, height: 1, background: '#E7E5E4' }} />
          </div>

          {/* Describe */}
          <label style={{ fontSize: 13, fontWeight: 600, color: '#78716C', display: 'block', marginBottom: 10 }}>
            {t.cant_find}
          </label>
          <input
            type="text"
            value={locationDescribe}
            onChange={(e) => setLocationDescribe(e.target.value)}
            placeholder={t.describe_ph}
            style={{ ...inputBase, height: 72, padding: '0 20px' }}
            onFocus={(e) => { e.target.style.borderColor = '#D97706' }}
            onBlur={(e) => { e.target.style.borderColor = '#E7E5E4' }}
          />
        </div>

        {/* Error */}
        {mutation.isError && (
          <p style={{ textAlign: 'center', color: '#DC2626', fontSize: 14, margin: '0 0 12px', fontWeight: 500 }}>
            Something went wrong. Please try again.
          </p>
        )}

        {/* ── CTA ──────────────────────────────────────── */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || mutation.isPending}
          style={{
            width: '100%', height: 84, borderRadius: 9999,
            background: canSubmit
              ? 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)'
              : '#E7E5E4',
            border: 'none',
            cursor: canSubmit && !mutation.isPending ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14,
            fontWeight: 800, fontSize: 18, letterSpacing: '0.06em',
            color: canSubmit ? 'white' : '#A8A29E',
            fontFamily: 'Manrope, "Noto Sans Malayalam", sans-serif',
            boxShadow: canSubmit ? '0 20px 40px rgba(234,88,12,0.25)' : 'none',
            transition: 'all 0.2s',
            marginBottom: 20,
          }}
        >
          {mutation.isPending ? (
            <span>Sharing...</span>
          ) : (
            <>
              {t.share_btn}
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </>
          )}
        </button>

        {/* ── Trust message ─────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#A8A29E' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{t.trust}</span>
        </div>

      </div>
    </div>
  )
}
