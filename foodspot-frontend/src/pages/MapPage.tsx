import { useState, useEffect, useRef, useCallback, useMemo, type RefObject, type CSSProperties } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { getSpots, createSpot, confirmSpot, notHereSpot, imageUrl } from '../api/client'
import type { FoodSpot } from '../types'
import { timeAgo } from '../utils/spotHelpers'
import { useLanguage } from '../context/LanguageContext'

declare global { interface Window { L: any } }

// ── Helpers ──────────────────────────────────────────────────────

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

function fmtDist(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`
}

function getDiscoveryEmoji(spot: FoodSpot): string {
  const text = ((spot.category || '') + ' ' + spot.title).toLowerCase()
  if (text.includes('tea') || text.includes('chaya') || text.includes('chai')) return '☕'
  if (text.includes('fish') || text.includes('meen') || text.includes('prawn') || text.includes('crab')) return '🐟'
  if (text.includes('night') || text.includes('midnight') || text.includes('1am') || text.includes('late')) return '🌙'
  if (text.includes('biriyani') || text.includes('biryani') || text.includes('meals') || text.includes('rice')) return '🍛'
  if (text.includes('snack') || text.includes('pazhampori') || text.includes('vada') || text.includes('bajji')) return '🍌'
  if (text.includes('bakery') || text.includes('bread') || text.includes('cake') || text.includes('biscuit')) return '🥐'
  if (text.includes('fresh') || text.includes('available') || text.includes('ready') || text.includes('batch')) return '🔥'
  return '🍽️'
}

// ── Marker HTML ────────────────────────────────────────────────────

function foodMarkerHtml(selected = false): string {
  const sz = selected ? 46 : 36
  const half = Math.round(sz / 2)
  return `<div style="width:${sz}px;height:${sz + 10}px;cursor:pointer;">
    <div style="
      width:${sz}px;height:${sz}px;
      background:${selected ? '#1D4ED8' : '#2563EB'};
      border-radius:${half}px ${half}px ${half}px 0;
      transform:rotate(-45deg);
      display:flex;align-items:center;justify-content:center;
      border:2.5px solid white;
      box-shadow:0 ${selected ? 8 : 4}px ${selected ? 24 : 14}px rgba(37,99,235,${selected ? 0.6 : 0.42});
    ">
      <div style="transform:rotate(45deg);display:flex;align-items:center;justify-content:center;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
          <path d="M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z"/>
        </svg>
      </div>
    </div>
  </div>`
}

function pendingMarkerHtml(): string {
  return `<div style="position:relative;width:20px;height:20px;">
    <div style="position:absolute;inset:-8px;border-radius:50%;background:rgba(37,99,235,0.18);animation:fsu-pulse 1.4s infinite;"></div>
    <div style="width:20px;height:20px;border-radius:50%;background:#2563EB;border:3px solid white;box-shadow:0 2px 12px rgba(37,99,235,0.5);"></div>
  </div>`
}

function userDotHtml(): string {
  return `<div style="position:relative;width:18px;height:18px;">
    <div style="position:absolute;width:34px;height:34px;top:-8px;left:-8px;border-radius:50%;background:rgba(66,133,244,0.15);animation:fsu-pulse 2s infinite;"></div>
    <div style="width:18px;height:18px;border-radius:50%;background:#4285F4;border:3px solid white;box-shadow:0 2px 8px rgba(66,133,244,0.5);"></div>
  </div>`
}

// ── Constants ──────────────────────────────────────────────────────

const KERALA_DISTRICTS = ['Kasaragod','Kannur','Wayanad','Kozhikode','Malappuram','Palakkad','Thrissur','Ernakulam','Idukki','Kottayam','Alappuzha','Pathanamthitta','Kollam','Thiruvananthapuram']
const FILTER_CHIPS = ['All', 'Tea', 'Snacks', 'Meals', 'Night Food', 'Fish', 'Bakery']

const DISTRICT_CENTERS: Record<string, [number, number]> = {
  Kasaragod: [12.4996, 74.9869], Kannur: [11.8745, 75.3704], Wayanad: [11.6854, 76.1320],
  Kozhikode: [11.2588, 75.7804], Malappuram: [11.0510, 76.0711], Palakkad: [10.7867, 76.6548],
  Thrissur: [10.5276, 76.2144], Ernakulam: [9.9816, 76.2999], Idukki: [9.9189, 77.1025],
  Kottayam: [9.5916, 76.5222], Alappuzha: [9.4981, 76.3388], Pathanamthitta: [9.2648, 76.7870],
  Kollam: [8.8932, 76.6141], Thiruvananthapuram: [8.5241, 76.9366],
}

// ── Discovery Card (floating, bottom-center) ──────────────────────

function DiscoveryCard({ spot, userLat, userLng, onClose, onConfirm, onNotHere }: {
  spot: FoodSpot
  userLat: number | null; userLng: number | null
  onClose: () => void
  onConfirm: (id: number) => void
  onNotHere: (id: number) => void
}) {
  const [vote, setVote] = useState<'here' | 'nothere' | null>(null)
  const img = spot.image_path ? imageUrl(spot.image_path) : null
  const locationLabel = spot.location_text
    ? spot.location_text.split(',')[0].trim()
    : spot.district || ''
  const directionsUrl = spot.latitude && spot.longitude
    ? `https://www.google.com/maps/dir/?api=1&destination=${spot.latitude},${spot.longitude}`
    : null
  const dist = userLat && userLng && spot.latitude && spot.longitude
    ? haversineKm(userLat, userLng, spot.latitude, spot.longitude)
    : null

  const handleStillAvailable = () => {
    if (vote) return
    setVote('here')
    onConfirm(spot.id)
  }

  const handleNotAvailable = () => {
    if (vote) return
    setVote('nothere')
    onNotHere(spot.id)
  }

  return (
    <motion.div
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 40, opacity: 0 }}
      transition={{ type: 'spring', damping: 30, stiffness: 320 }}
      style={{
        position: 'fixed',
        bottom: 20, left: '50%',
        transform: 'translateX(-50%)',
        width: 420,
        maxWidth: 'calc(100vw - 32px)',
        zIndex: 600,
        background: 'white',
        borderRadius: 24,
        boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
        fontFamily: 'Manrope, sans-serif',
        overflow: 'hidden',
      }}
    >
      {img && (
        <div style={{ position: 'relative', height: 150 }}>
          <img src={img} alt={spot.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 60%)' }} />
        </div>
      )}

      <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, width: 32, height: 32, borderRadius: '50%', background: img ? 'rgba(0,0,0,0.45)' : '#F5F4F2', border: 'none', cursor: 'pointer', color: img ? 'white' : '#44403C', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: img ? 'blur(4px)' : 'none', zIndex: 2 }}>✕</button>

      <div style={{ padding: '16px 18px 18px' }}>
        <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: '#18181B', lineHeight: 1.25, letterSpacing: '-0.02em', paddingRight: img ? 0 : 36 }}>
          {spot.title}
        </h2>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          {locationLabel && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width="11" height="13" viewBox="0 0 10 13" fill="#2563EB">
                <path d="M5 0C2.24 0 0 2.24 0 5c0 3.75 5 8 5 8s5-4.25 5-8c0-2.76-2.24-5-5-5z"/>
                <circle cx="5" cy="5" r="1.9" fill="white"/>
              </svg>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#44403C' }}>{locationLabel}</span>
            </div>
          )}
          {dist !== null && (
            <span style={{ fontSize: 12, color: '#A8A29E', fontWeight: 600 }}>{fmtDist(dist)} away</span>
          )}
        </div>

        {spot.description && (
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#57534E', lineHeight: 1.6, fontStyle: 'italic' }}>
            {spot.description}
          </p>
        )}

        <div style={{ fontSize: 12, color: '#78716C', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span>✅ <strong style={{ color: '#16A34A' }}>{spot.confirmed_count}</strong> still available</span>
          <span>·</span>
          <span>❌ <strong style={{ color: '#DC2626' }}>{spot.not_here_count ?? 0}</strong> not available</span>
          <span>·</span>
          <span>{timeAgo(spot.created_at)}</span>
        </div>

        {directionsUrl ? (
          <a href={directionsUrl} target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%', height: 52, borderRadius: 14, border: 'none', background: '#2563EB', color: 'white', fontWeight: 800, fontSize: 15, fontFamily: 'inherit', textDecoration: 'none', boxShadow: '0 6px 20px rgba(37,99,235,0.30)', marginBottom: 10 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="3 11 22 2 13 21 11 13 3 11"/>
            </svg>
            Open in Google Maps
          </a>
        ) : (
          <div style={{ height: 52, borderRadius: 14, background: '#F5F4F2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#A8A29E', marginBottom: 10 }}>
            No location data
          </div>
        )}

        {vote ? (
          <div style={{ height: 42, borderRadius: 11, background: vote === 'here' ? '#F0FDF4' : '#FEF2F2', border: `1.5px solid ${vote === 'here' ? '#86EFAC' : '#FECACA'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: vote === 'here' ? '#16A34A' : '#DC2626' }}>
            {vote === 'here' ? '✅ Still Available!' : '❌ Not Available!'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button onClick={handleStillAvailable}
              style={{ height: 42, borderRadius: 11, border: '1.5px solid #BBF7D0', background: '#F0FDF4', color: '#16A34A', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              ✅ Still Available
            </button>
            <button onClick={handleNotAvailable}
              style={{ height: 42, borderRadius: 11, border: '1.5px solid #FECACA', background: '#FEF2F2', color: '#DC2626', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              ❌ Not Available
            </button>
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ── Spot Row ───────────────────────────────────────────────────────

function SpotRow({ spot, centerLat, centerLng, onClick }: {
  spot: FoodSpot
  centerLat: number | null; centerLng: number | null
  onClick: () => void
}) {
  const dist = centerLat && centerLng && spot.latitude && spot.longitude
    ? haversineKm(centerLat, centerLng, spot.latitude, spot.longitude)
    : null
  const img = spot.image_path ? imageUrl(spot.image_path) : null
  const location = spot.location_text?.split(',')[0]?.trim() || spot.district || ''
  const hue = (spot.id * 47) % 360

  return (
    <div onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', cursor: 'pointer', borderBottom: '1px solid #F3F4F6', transition: 'background 0.1s' }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#F9FAFB' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'white' }}
    >
      <div style={{ width: 46, height: 46, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: `hsl(${hue},52%,88%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
        {img
          ? <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
          : getDiscoveryEmoji(spot)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{spot.title}</div>
        {location && <div style={{ fontSize: 11, color: '#9CA3AF', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>📍 {location}</div>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
        {dist !== null && <span style={{ fontSize: 11, fontWeight: 700, color: '#6B7280' }}>{fmtDist(dist)}</span>}
        <span style={{ fontSize: 11, fontWeight: 600, color: '#16A34A' }}>✅ {spot.confirmed_count}</span>
      </div>
    </div>
  )
}

// ── Live Discoveries Sidebar (right drawer) ───────────────────────

function LiveDiscoveriesSidebar({ spots, centerLat, centerLng, onClose, onPanTo, onConfirm }: {
  spots: FoodSpot[]
  centerLat: number | null; centerLng: number | null
  onClose: () => void
  onPanTo: (lat: number, lng: number) => void
  onConfirm: (id: number) => void
}) {
  const [activeFilter, setActiveFilter] = useState('All')
  const [sortBy, setSortBy] = useState<'nearest' | 'confirmed' | 'recent'>('nearest')
  const [detailSpot, setDetailSpot] = useState<FoodSpot | null>(null)
  const [confirming, setConfirming] = useState(false)

  const spotsWithDist = useMemo(() => spots.map(s => ({
    ...s,
    _dist: (centerLat && centerLng && s.latitude && s.longitude)
      ? haversineKm(centerLat, centerLng, s.latitude, s.longitude)
      : null,
  })), [spots, centerLat, centerLng])

  const filtered = useMemo(() => {
    let list = [...spotsWithDist]
    if (activeFilter !== 'All') {
      list = list.filter(s =>
        s.category?.toLowerCase().includes(activeFilter.toLowerCase()) ||
        s.title?.toLowerCase().includes(activeFilter.toLowerCase())
      )
    }
    if (sortBy === 'nearest') {
      if (centerLat && centerLng) {
        list = list.filter(s => s._dist !== null && s._dist <= 10)
        list.sort((a, b) => (a._dist ?? Infinity) - (b._dist ?? Infinity))
      } else {
        list.sort((a, b) => b.confirmed_count - a.confirmed_count)
      }
    } else if (sortBy === 'confirmed') {
      list.sort((a, b) => b.confirmed_count - a.confirmed_count)
    } else {
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    }
    return list.slice(0, 30)
  }, [spotsWithDist, activeFilter, sortBy, centerLat, centerLng])

  const handleRowClick = (spot: FoodSpot) => {
    setDetailSpot(spot)
    if (spot.latitude && spot.longitude) onPanTo(spot.latitude, spot.longitude)
  }

  const handleConfirm = () => {
    if (!detailSpot || confirming) return
    setConfirming(true)
    onConfirm(detailSpot.id)
    setTimeout(() => setConfirming(false), 2000)
  }

  const handleShare = () => {
    if (!detailSpot) return
    const url = detailSpot.latitude && detailSpot.longitude
      ? `https://www.google.com/maps/dir/?api=1&destination=${detailSpot.latitude},${detailSpot.longitude}`
      : ''
    if (navigator.share && url) {
      navigator.share({ title: detailSpot.title, text: detailSpot.description ?? '', url }).catch(() => {})
    } else if (url) {
      navigator.clipboard?.writeText(url).catch(() => {})
    }
  }

  const sidebarStyle: CSSProperties = {
    position: 'fixed', top: 100, right: 16, bottom: 16, width: 340,
    background: 'white', borderRadius: 16,
    boxShadow: '0 20px 60px rgba(0,0,0,0.14)',
    zIndex: 450, display: 'flex', flexDirection: 'column',
    fontFamily: 'Manrope, sans-serif', overflow: 'hidden',
  }

  if (detailSpot) {
    const img = detailSpot.image_path ? imageUrl(detailSpot.image_path) : null
    const location = detailSpot.location_text?.split(',')[0]?.trim() || detailSpot.district || ''
    const dist = centerLat && centerLng && detailSpot.latitude && detailSpot.longitude
      ? haversineKm(centerLat, centerLng, detailSpot.latitude, detailSpot.longitude) : null
    const directionsUrl = detailSpot.latitude && detailSpot.longitude
      ? `https://www.google.com/maps/dir/?api=1&destination=${detailSpot.latitude},${detailSpot.longitude}` : null
    const hue = (detailSpot.id * 47) % 360

    return (
      <motion.div
        initial={{ x: 360, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 360, opacity: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        style={sidebarStyle}
      >
        <div style={{ position: 'relative', height: 150, flexShrink: 0 }}>
          {img ? (
            <img src={img} alt={detailSpot.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', background: `hsl(${hue},52%,88%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>{getDiscoveryEmoji(detailSpot)}</div>
          )}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 55%)' }} />
          <button onClick={() => setDetailSpot(null)}
            style={{ position: 'absolute', top: 10, left: 10, width: 34, height: 34, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', border: 'none', cursor: 'pointer', color: 'white', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
          <button onClick={onClose}
            style={{ position: 'absolute', top: 10, right: 10, width: 34, height: 34, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', border: 'none', cursor: 'pointer', color: 'white', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>

        <div className="fs-modal-card" style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 16px' }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 800, color: '#18181B', lineHeight: 1.3, letterSpacing: '-0.02em' }}>{detailSpot.title}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            {location && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg width="10" height="12" viewBox="0 0 10 13" fill="#2563EB"><path d="M5 0C2.24 0 0 2.24 0 5c0 3.75 5 8 5 8s5-4.25 5-8c0-2.76-2.24-5-5-5z"/><circle cx="5" cy="5" r="1.9" fill="white"/></svg>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#44403C' }}>{location}</span>
              </div>
            )}
            {dist !== null && <span style={{ fontSize: 12, color: '#A8A29E', fontWeight: 600 }}>{fmtDist(dist)} away</span>}
          </div>
          {detailSpot.description && (
            <p style={{ margin: '0 0 10px', fontSize: 13, color: '#57534E', lineHeight: 1.6, fontStyle: 'italic' }}>{detailSpot.description}</p>
          )}
          <div style={{ fontSize: 12, color: '#78716C', marginBottom: 14 }}>
            ✅ <strong style={{ color: '#18181B' }}>{detailSpot.confirmed_count}</strong> Confirmations · {timeAgo(detailSpot.created_at)}
          </div>
          {directionsUrl ? (
            <a href={directionsUrl} target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', height: 48, borderRadius: 12, background: '#2563EB', color: 'white', fontWeight: 800, fontSize: 14, fontFamily: 'inherit', textDecoration: 'none', boxShadow: '0 4px 16px rgba(37,99,235,0.30)', marginBottom: 10 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
              Open in Google Maps
            </a>
          ) : (
            <div style={{ height: 48, borderRadius: 12, background: '#F5F4F2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#A8A29E', marginBottom: 10 }}>No location data</div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button onClick={handleConfirm} disabled={confirming}
              style={{ height: 40, borderRadius: 10, border: '1.5px solid #BBF7D0', background: '#F0FDF4', color: confirming ? '#A8A29E' : '#16A34A', fontWeight: 700, fontSize: 13, cursor: confirming ? 'default' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              ✅ {confirming ? 'Confirmed!' : 'Still Available'}
            </button>
            <button onClick={handleShare}
              style={{ height: 40, borderRadius: 10, border: '1.5px solid #E7E5E4', background: 'white', color: '#44403C', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              Share
            </button>
          </div>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ x: 360, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 360, opacity: 0 }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      style={sidebarStyle}
    >
      <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#111827' }}>Live Discoveries Near You</div>
          <div style={{ fontSize: 11, color: '#9CA3AF' }}>{filtered.length} discoveries</div>
        </div>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as 'nearest' | 'confirmed' | 'recent')}
          style={{ fontSize: 11, fontWeight: 600, color: '#374151', border: '1px solid #E5E7EB', borderRadius: 7, padding: '4px 6px', background: 'white', cursor: 'pointer', fontFamily: 'inherit', outline: 'none', flexShrink: 0 }}>
          <option value="nearest">Nearest</option>
          <option value="confirmed">Most Confirmed</option>
          <option value="recent">Recent</option>
        </select>
        <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: '50%', background: '#F3F4F6', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#374151', flexShrink: 0 }}>✕</button>
      </div>

      <div className="chips-row" style={{ display: 'flex', gap: 5, padding: '8px 12px', overflowX: 'auto', flexShrink: 0, borderBottom: '1px solid #F3F4F6' }}>
        {FILTER_CHIPS.map(chip => (
          <button key={chip}
            onClick={() => setActiveFilter(chip === activeFilter && chip !== 'All' ? 'All' : chip)}
            style={{ height: 28, padding: '0 11px', borderRadius: 999, flexShrink: 0, border: `1px solid ${activeFilter === chip ? '#1E293B' : '#E5E7EB'}`, background: activeFilter === chip ? '#1E293B' : 'white', color: activeFilter === chip ? 'white' : '#374151', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s' }}>
            {chip}
          </button>
        ))}
      </div>

      <div className="fs-modal-card" style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length > 0 ? (
          filtered.map(s => (
            <SpotRow key={s.id} spot={s} centerLat={centerLat} centerLng={centerLng} onClick={() => handleRowClick(s)} />
          ))
        ) : (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: '#9CA3AF', fontSize: 13, fontStyle: 'italic' }}>
            No discoveries in this area yet
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ── Trending Discoveries Sidebar (left panel) ─────────────────────

function TrendingSidebar({ spots }: { spots: FoodSpot[] }) {
  const trending = useMemo(() =>
    [...spots].sort((a, b) => b.confirmed_count - a.confirmed_count).slice(0, 10),
    [spots]
  )

  return (
    <div style={{
      position: 'fixed', top: 142, left: 16, zIndex: 500,
      width: 220, background: 'white', borderRadius: 12,
      border: '1px solid #E5E7EB', boxShadow: '0 4px 20px rgba(0,0,0,0.07)',
      display: 'flex', flexDirection: 'column',
      maxHeight: 'calc(100vh - 180px)', overflow: 'hidden',
      fontFamily: 'Manrope, sans-serif',
    }}>
      <div style={{ padding: '10px 12px 7px', borderBottom: '1px solid #F1F5F9' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#1E293B', letterSpacing: '0.05em', textTransform: 'uppercase' }}>🔥 Trending Discoveries</div>
        <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 1 }}>Most confirmed right now</div>
      </div>
      <div className="fs-modal-card" style={{ flex: 1, overflowY: 'auto', padding: '4px 5px' }}>
        {trending.length === 0 ? (
          <div style={{ padding: '16px 10px', fontSize: 11, color: '#94A3B8', textAlign: 'center', fontStyle: 'italic' }}>No discoveries yet</div>
        ) : trending.map((spot) => (
          <div key={spot.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 8px', borderRadius: 8, marginBottom: 1 }}>
            <span style={{ fontSize: 15, lineHeight: 1, flexShrink: 0 }}>{getDiscoveryEmoji(spot)}</span>
            <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: '#1E293B', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{spot.title}</span>
            {spot.confirmed_count > 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, flexShrink: 0, color: '#1E293B', background: '#F1F5F9', borderRadius: 5, padding: '1px 6px', minWidth: 18, textAlign: 'center' }}>
                {spot.confirmed_count}
              </span>
            )}
          </div>
        ))}
      </div>
      <div style={{ padding: '6px 12px 8px', borderTop: '1px solid #F1F5F9' }}>
        <div style={{ fontSize: 10, color: '#94A3B8', textAlign: 'center' }}>Tap map to share a discovery</div>
      </div>
    </div>
  )
}

// ── Add Discovery Sheet ────────────────────────────────────────────

function AddDiscoverySheet({ lat, lng, address, fileRef, isPending, onSubmit, onClose }: {
  lat: number | null; lng: number | null; address: string
  fileRef: RefObject<HTMLInputElement>
  isPending: boolean
  onSubmit: (data: { discovery: string; image: File | null }) => void
  onClose: () => void
}) {
  const [discovery, setDiscovery] = useState('')
  const [image, setImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)

  const locationSet = lat !== null && lng !== null
  const canSubmit = discovery.trim().length > 0 && locationSet && !isPending

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', fontFamily: 'Manrope, sans-serif' }}>
      <div style={{ padding: '18px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: '#18181B', letterSpacing: '-0.02em' }}>Share Food Discovery</h2>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#A8A29E' }}>What are locals eating right now?</p>
        </div>
        <button onClick={onClose}
          style={{ width: 36, height: 36, borderRadius: '50%', background: '#F5F4F2', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#44403C', fontSize: 17, flexShrink: 0 }}>✕</button>
      </div>

      <div className="fs-modal-card" style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>
        {lat === null ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 12, background: '#EFF6FF', border: '1.5px dashed #93C5FD', marginBottom: 14 }}>
            <span style={{ fontSize: 20, flexShrink: 0 }}>📍</span>
            <div>
              <div style={{ fontSize: 13, color: '#1E40AF', fontWeight: 700 }}>Tap the map to pin the exact location</div>
              <div style={{ fontSize: 11, color: '#3B82F6', marginTop: 2 }}>Required — helps others find this discovery</div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px', borderRadius: 12, background: '#F0FDF4', border: '1px solid #BBF7D0', marginBottom: 14 }}>
            <svg width="11" height="11" viewBox="0 0 10 13" fill="#15803D" style={{ flexShrink: 0 }}>
              <path d="M5 0C2.24 0 0 2.24 0 5c0 3.75 5 8 5 8s5-4.25 5-8c0-2.76-2.24-5-5-5z"/>
              <circle cx="5" cy="5" r="1.9" fill="white"/>
            </svg>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, color: '#15803D', fontWeight: 700 }}>Location pinned ✓</div>
              {address ? (
                <div style={{ fontSize: 11, color: '#374151', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{address} · Drag pin to adjust</div>
              ) : (
                <div style={{ fontSize: 11, color: '#6B7280' }}>Drag the pin to adjust</div>
              )}
            </div>
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 800, color: '#18181B', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            What did you discover? <span style={{ color: '#2563EB' }}>*</span>
          </label>
          <input value={discovery} onChange={(e) => setDiscovery(e.target.value)}
            placeholder="e.g. Fresh Pazhampori Available, Strong Chaya Ready…"
            autoFocus
            style={{ width: '100%', height: 52, padding: '0 14px', border: `1.5px solid ${discovery.trim() ? '#334155' : '#E2E8F0'}`, borderRadius: 12, fontSize: 14, fontWeight: 600, color: '#18181B', background: 'white', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', transition: 'border-color 0.15s' }}
            onFocus={(e) => { e.target.style.borderColor = '#334155' }}
            onBlur={(e) => { e.target.style.borderColor = discovery.trim() ? '#334155' : '#E2E8F0' }}
          />
          <div style={{ fontSize: 11, color: '#A8A29E', marginTop: 4, paddingLeft: 2 }}>
            e.g. "Fresh Pazhampori" · "Night Thattukada open" · "Weekend Biriyani started"
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ fontSize: 11, fontWeight: 800, color: '#18181B', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Food Photo <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, color: '#A8A29E', textTransform: 'none', letterSpacing: 0 }}>optional</span>
          </label>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (!f) return
              setImage(f)
              const r = new FileReader()
              r.onload = (ev) => setImagePreview((ev.target?.result as string) ?? null)
              r.readAsDataURL(f)
              e.target.value = ''
            }}
          />
          {imagePreview ? (
            <div style={{ position: 'relative', height: 110, borderRadius: 14, overflow: 'hidden' }}>
              <img src={imagePreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <button onClick={() => { setImage(null); setImagePreview(null) }}
                style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', border: 'none', cursor: 'pointer', color: 'white', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()}
              style={{ width: '100%', height: 70, borderRadius: 14, border: '2px dashed #CBD5E1', background: '#F8FAFC', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#94A3B8', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
              Upload a food photo
            </button>
          )}
        </div>

        <button onClick={() => onSubmit({ discovery, image })} disabled={!canSubmit}
          style={{
            width: '100%', height: 58, borderRadius: 9999, border: 'none',
            background: canSubmit ? 'linear-gradient(135deg, #2563EB, #1D4ED8)' : '#E7E5E4',
            color: canSubmit ? 'white' : '#A8A29E',
            fontWeight: 800, fontSize: 16, fontFamily: 'inherit',
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            boxShadow: canSubmit ? '0 8px 24px rgba(37,99,235,0.28)' : 'none',
            transition: 'all 0.18s', letterSpacing: '-0.01em',
          }}>
          {isPending ? 'Sharing…' : !locationSet ? 'Tap map to set location first' : '🔥 Share Discovery'}
        </button>
      </div>
    </div>
  )
}

// ── Branding Card ─────────────────────────────────────────────────

function BrandingCard() {
  return (
    <div style={{
      position: 'fixed', top: 16, left: 16, zIndex: 500,
      width: 220, height: 110,
      background: 'white', border: '1px solid #E5E7EB', borderRadius: 12,
      boxShadow: '0 8px 30px rgba(0,0,0,0.06)',
      fontFamily: 'Manrope, sans-serif', padding: '14px 18px',
      display: 'flex', flexDirection: 'row', alignItems: 'center',
      gap: 12, userSelect: 'none',
    }}>
      <svg width="38" height="46" viewBox="0 0 38 46" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
        <path d="M19 2C10.16 2 3 9.16 3 18C3 29.5 19 44 19 44C19 44 35 29.5 35 18C35 9.16 27.84 2 19 2Z" fill="#1E293B"/>
        <circle cx="19" cy="18" r="11" fill="#2563EB"/>
        <line x1="15" y1="12" x2="15" y2="14.5" stroke="white" strokeWidth="1.1" strokeLinecap="round"/>
        <line x1="16.5" y1="12" x2="16.5" y2="14.5" stroke="white" strokeWidth="1.1" strokeLinecap="round"/>
        <line x1="18" y1="12" x2="18" y2="14.5" stroke="white" strokeWidth="1.1" strokeLinecap="round"/>
        <path d="M16.5 14.5 C16.5 15.5 16.5 16 16.5 24" stroke="white" strokeWidth="1.3" strokeLinecap="round"/>
        <ellipse cx="22.5" cy="14.5" rx="2" ry="2.5" stroke="white" strokeWidth="1.3" fill="none"/>
        <line x1="22.5" y1="17" x2="22.5" y2="24" stroke="white" strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#111827', letterSpacing: '0.5px', lineHeight: 1.1, whiteSpace: 'nowrap' }}>FOODSPOT</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#2563EB', lineHeight: 1.3 }}>Undo?</div>
        <div style={{ fontSize: 11, fontWeight: 500, color: '#6B7280', marginTop: 1, whiteSpace: 'nowrap' }}>Live Discoveries</div>
      </div>
    </div>
  )
}

// ── MapPage ────────────────────────────────────────────────────────

interface Props { onSwitchView: () => void }

export default function MapPage({ onSwitchView }: Props) {
  const qc = useQueryClient()
  const { lang, setLang } = useLanguage()

  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markersLayerRef = useRef<any>(null)
  const tileLayerRef = useRef<any>(null)
  const userMarkerRef = useRef<any>(null)
  const tempMarkerRef = useRef<any>(null)
  const addFileRef = useRef<HTMLInputElement>(null)
  const addOpenRef = useRef(false)

  const [userLat, setUserLat] = useState<number | null>(null)
  const [userLng, setUserLng] = useState<number | null>(null)
  const [hasSearchedLocation, setHasSearchedLocation] = useState(false)
  const [spotsOpen, setSpotsOpen] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [selectedSpot, setSelectedSpot] = useState<FoodSpot | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  useEffect(() => { addOpenRef.current = addOpen }, [addOpen])
  const [pendingLat, setPendingLat] = useState<number | null>(null)
  const [pendingLng, setPendingLng] = useState<number | null>(null)
  const [pendingAddress, setPendingAddress] = useState('')
  const [pendingDistrict, setPendingDistrict] = useState<string | null>(null)
  const [centerLat, setCenterLat] = useState<number | null>(null)
  const [centerLng, setCenterLng] = useState<number | null>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searchFocused, setSearchFocused] = useState(false)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: spots = [] } = useQuery({ queryKey: ['spots'], queryFn: () => getSpots() })

  const mappableSpots = useMemo(() => spots.filter((s) => s.latitude && s.longitude), [spots])

  const nearbyCount = useMemo(() => {
    if (!centerLat || !centerLng) return spots.length
    return spots.filter(s => s.latitude && s.longitude &&
      haversineKm(centerLat, centerLng, s.latitude!, s.longitude!) <= 10
    ).length
  }, [spots, centerLat, centerLng])

  useEffect(() => {
    const L = window.L
    const map = mapRef.current
    if (!L || !map) return
    if (tileLayerRef.current) map.removeLayer(tileLayerRef.current)
    const url = isDarkMode
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
    const attr = isDarkMode
      ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
      : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    const tile = L.tileLayer(url, { attribution: attr, maxZoom: 19, subdomains: 'abcd' })
    tile.addTo(map)
    tileLayerRef.current = tile
  }, [isDarkMode])

  const confirmMutation = useMutation({
    mutationFn: (id: number) => confirmSpot(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['spots'] }),
  })

  const notHereMutation = useMutation({
    mutationFn: (id: number) => notHereSpot(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['spots'] }),
  })

  const addMutation = useMutation({
    mutationFn: (fd: FormData) => createSpot(fd),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['spots'] })
      closeAdd()
    },
  })

  // ── Map init ────────────────────────────────────────────────────

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return
    const L = window.L
    if (!L) return

    const map = L.map(mapContainerRef.current, {
      center: [10.5, 76.3],
      zoom: 7,
      zoomControl: false,
    })

    const tile = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    })
    tile.addTo(map)
    tileLayerRef.current = tile

    const layer = L.layerGroup().addTo(map)
    markersLayerRef.current = layer

    const makeDraggable = (marker: any) => {
      marker.on('dragend', (ev: any) => {
        const p = ev.target.getLatLng()
        setPendingLat(p.lat); setPendingLng(p.lng)
        reverseGeocode(p.lat, p.lng)
      })
    }

    map.on('click', (e: any) => {
      setPendingLat(e.latlng.lat)
      setPendingLng(e.latlng.lng)
      reverseGeocode(e.latlng.lat, e.latlng.lng)

      if (tempMarkerRef.current) {
        tempMarkerRef.current.setLatLng(e.latlng)
      } else {
        const icon = L.divIcon({ html: pendingMarkerHtml(), className: '', iconSize: [20, 20], iconAnchor: [10, 10] })
        const m = L.marker(e.latlng, { icon, draggable: true }).addTo(map)
        makeDraggable(m)
        tempMarkerRef.current = m
      }

      if (!addOpenRef.current) {
        setSelectedSpot(null)
        setAddOpen(true)
      }
    })

    let alive = true
    fetch('https://nominatim.openstreetmap.org/lookup?osm_ids=R3083547&format=json&polygon_geojson=1&polygon_threshold=0.005', {
      headers: { 'User-Agent': 'FoodSpotUndo/1.0 (jisprofessional2@gmail.com)' }
    })
      .then(r => r.json())
      .then((data: any[]) => {
        if (!alive) return
        const geojson = data[0]?.geojson
        if (!geojson) return
        L.geoJSON(
          { type: 'Feature', geometry: geojson, properties: {} },
          { style: () => ({ color: '#1D4ED8', weight: 3, opacity: 0.85, fillColor: '#BFDBFE', fillOpacity: 0.18 }) }
        ).addTo(map)
      })
      .catch(() => {})

    mapRef.current = map
    return () => { alive = false; map.remove(); mapRef.current = null; markersLayerRef.current = null }
  }, [])

  useEffect(() => {
    const L = window.L
    const layer = markersLayerRef.current
    if (!L || !layer) return
    layer.clearLayers()
    mappableSpots.forEach((spot) => {
      const selected = selectedSpot?.id === spot.id
      const sz = selected ? 46 : 36
      const icon = L.divIcon({ html: foodMarkerHtml(selected), className: '', iconSize: [sz, sz + 10], iconAnchor: [sz / 2, sz + 10] })
      const marker = L.marker([spot.latitude!, spot.longitude!], { icon })
      marker.on('click', (e: any) => {
        e.originalEvent?.stopPropagation()
        setSelectedSpot(spot)
        setAddOpen(false)
        mapRef.current?.panTo([spot.latitude!, spot.longitude!], { animate: true, duration: 0.5 })
      })
      layer.addLayer(marker)
    })
  }, [mappableSpots, selectedSpot])

  useEffect(() => {
    const L = window.L
    const map = mapRef.current
    if (!L || !map || !userLat || !userLng) return
    const icon = L.divIcon({ html: userDotHtml(), className: '', iconSize: [18, 18], iconAnchor: [9, 9] })
    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([userLat, userLng])
    } else {
      userMarkerRef.current = L.marker([userLat, userLng], { icon, zIndexOffset: 1000 }).addTo(map)
    }
  }, [userLat, userLng])

  // ── Actions ─────────────────────────────────────────────────────

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLat(pos.coords.latitude)
        setUserLng(pos.coords.longitude)
        setCenterLat(pos.coords.latitude)
        setCenterLng(pos.coords.longitude)
        mapRef.current?.flyTo([pos.coords.latitude, pos.coords.longitude], 14, { duration: 1.0 })
        setHasSearchedLocation(true)
      },
      () => {},
      { timeout: 8000 }
    )
  }, [])

  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (value.trim().length < 2) { setSearchResults([]); return }
    searchTimeout.current = setTimeout(async () => {
      try {
        const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(value)}&limit=12&lang=en&lat=10.85&lon=76.27`
        const res = await fetch(url)
        const { features = [] } = await res.json()
        const results = (features as any[])
          .filter((f: any) => {
            const lat = f.geometry.coordinates[1]
            const lon = f.geometry.coordinates[0]
            return lat > 6 && lat < 38 && lon > 68 && lon < 98
          })
          .map((f: any) => {
            const p = f.properties
            const nameParts = [
              p.name,
              p.city || p.town || p.village || p.municipality,
              p.county || p.state_district,
              p.state,
            ].filter(Boolean)
            return {
              place_id: p.osm_id ?? f.geometry.coordinates.join(','),
              lat: String(f.geometry.coordinates[1]),
              lon: String(f.geometry.coordinates[0]),
              display_name: nameParts.join(', '),
              type: p.osm_value || p.type || '',
            }
          })
        setSearchResults(results)
      } catch { setSearchResults([]) }
    }, 200)
  }, [])

  const selectResult = useCallback((r: any) => {
    const lat = parseFloat(r.lat)
    const lng = parseFloat(r.lon)
    mapRef.current?.flyTo([lat, lng], 14, { duration: 0.9 })
    setSearchQuery(r.display_name.split(',')[0])
    setSearchResults([])
    setSearchFocused(false)
    setHasSearchedLocation(true)
    setSpotsOpen(false)
    setCenterLat(lat)
    setCenterLng(lng)
  }, [])

  const clearSearch = useCallback(() => {
    setSearchQuery('')
    setSearchResults([])
    setSearchFocused(false)
    setHasSearchedLocation(false)
    setSpotsOpen(false)
    setCenterLat(null)
    setCenterLng(null)
    mapRef.current?.flyTo([10.5, 76.3], 7, { duration: 0.8 })
  }, [])

  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&accept-language=en`
      const res = await fetch(url, { headers: { 'User-Agent': 'FoodSpotUndo/1.0 (jisprofessional2@gmail.com)' } })
      const data = await res.json()
      setPendingAddress(data.display_name?.split(',').slice(0, 3).join(', ') ?? '')
      const addr = data.address ?? {}
      const candidates = [addr.county, addr.state_district, addr.city_district, addr.city, data.display_name]
        .filter(Boolean).join(' ')
      const matched = KERALA_DISTRICTS.find(d => candidates.toLowerCase().includes(d.toLowerCase()))
      setPendingDistrict(matched ?? null)
    } catch {
      setPendingAddress('')
      setPendingDistrict(null)
    }
  }

  const closeAdd = useCallback(() => {
    setAddOpen(false)
    setPendingLat(null); setPendingLng(null); setPendingAddress(''); setPendingDistrict(null)
    if (tempMarkerRef.current && mapRef.current) {
      mapRef.current.removeLayer(tempMarkerRef.current)
      tempMarkerRef.current = null
    }
  }, [])

  const handleDiscoverySubmit = useCallback((data: { discovery: string; image: File | null }) => {
    if (!data.discovery.trim() || !pendingLat || !pendingLng) return
    const fd = new FormData()
    fd.append('title', data.discovery.trim())
    fd.append('latitude', String(pendingLat))
    fd.append('longitude', String(pendingLng))
    if (pendingAddress) fd.append('location_text', pendingAddress)
    if (data.image) fd.append('image', data.image)
    if (pendingDistrict) fd.append('district', pendingDistrict)
    addMutation.mutate(fd)
  }, [pendingLat, pendingLng, pendingAddress, pendingDistrict, addMutation])

  const openAddFromButton = useCallback(() => {
    setSelectedSpot(null)
    setAddOpen(true)
  }, [])

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', fontFamily: 'Manrope, sans-serif' }}>
      <style>{`
        @keyframes fsu-pulse {
          0%   { transform: scale(1);   opacity: 0.8; }
          50%  { transform: scale(1.6); opacity: 0.15; }
          100% { transform: scale(1);   opacity: 0.8; }
        }
        .leaflet-control-zoom { display: none !important; }
        .leaflet-control-attribution { font-size: 10px !important; opacity: 0.55; }
      `}</style>

      {/* MAP */}
      <div ref={mapContainerRef} style={{ position: 'absolute', inset: 0, zIndex: 0 }} />

      {/* ── SEARCH BAR ──────────────────────────────────────────── */}
      <div style={{ position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)', width: 'min(760px, calc(100vw - 32px))', zIndex: 500 }}>
        <div style={{ height: 68, borderRadius: 9999, background: 'white', boxShadow: '0 6px 30px rgba(0,0,0,0.10)', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 10 }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', position: 'relative' }}>
            <svg style={{ position: 'absolute', left: 0, color: '#A8A29E', pointerEvents: 'none' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input type="text" value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 250)}
              placeholder="Search a place or use current location"
              style={{ width: '100%', background: 'none', border: 'none', outline: 'none', fontSize: 15, fontWeight: 500, color: '#18181B', paddingLeft: 26, fontFamily: 'inherit' }}
            />
            {searchQuery && (
              <button onMouseDown={clearSearch} style={{ position: 'absolute', right: 0, background: 'none', border: 'none', cursor: 'pointer', color: '#A8A29E', padding: '2px 4px', fontSize: 16, lineHeight: 1, display: 'flex', alignItems: 'center' }}>✕</button>
            )}
          </div>
          <button onClick={requestLocation} title="Use my location"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 7, color: userLat ? '#4285F4' : '#78716C', flexShrink: 0, borderRadius: '50%' }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="2"/>
              <line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/>
              <line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/>
            </svg>
          </button>
          <div style={{ width: 1, height: 26, background: '#F1F5F9', flexShrink: 0 }} />
          <button onClick={openAddFromButton} title="Share a discovery"
            style={{ height: 40, padding: '0 14px', borderRadius: 9999, background: '#1E293B', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: 'white', fontWeight: 700, fontSize: 13, fontFamily: 'inherit', flexShrink: 0 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add
          </button>
        </div>

        <AnimatePresence>
          {searchFocused && searchResults.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0, background: 'white', borderRadius: 18, boxShadow: '0 8px 32px rgba(0,0,0,0.12)', overflow: 'hidden', zIndex: 10 }}
            >
              {searchResults.map((r: any) => {
                const parts = r.display_name.split(',')
                const title = parts[0].trim()
                const sub = parts.slice(1, 4).map((p: string) => p.trim()).filter(Boolean).join(', ')
                const typeLabel = r.type ? r.type.replace(/_/g, ' ') : ''
                return (
                  <div key={r.place_id} onMouseDown={() => selectResult(r)}
                    style={{ padding: '10px 18px', cursor: 'pointer', borderBottom: '1px solid #F5F4F2', display: 'flex', alignItems: 'flex-start', gap: 10 }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#EFF6FF' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'white' }}>
                    <svg width="12" height="15" viewBox="0 0 10 13" fill="#2563EB" style={{ flexShrink: 0, marginTop: 2 }}>
                      <path d="M5 0C2.24 0 0 2.24 0 5c0 3.75 5 8 5 8s5-4.25 5-8c0-2.76-2.24-5-5-5z"/>
                      <circle cx="5" cy="5" r="1.9" fill="white"/>
                    </svg>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#18181B' }}>{title}</span>
                        {typeLabel && <span style={{ fontSize: 10, fontWeight: 600, color: '#2563EB', background: '#EFF6FF', padding: '1px 6px', borderRadius: 4, textTransform: 'capitalize', flexShrink: 0 }}>{typeLabel}</span>}
                      </div>
                      {sub && <div style={{ fontSize: 11, color: '#A8A29E', marginTop: 2, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{sub}</div>}
                    </div>
                  </div>
                )
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── BRANDING CARD ───────────────────────────────────────── */}
      <BrandingCard />

      {/* ── TRENDING SIDEBAR (below branding card) ──────────────── */}
      <TrendingSidebar spots={spots} />

      {/* ── ZOOM CONTROLS ───────────────────────────────────────── */}
      <div style={{ position: 'absolute', right: 20, top: '50%', transform: 'translateY(-50%)', zIndex: 500, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[{ l: '+', fn: () => mapRef.current?.zoomIn() }, { l: '−', fn: () => mapRef.current?.zoomOut() }].map(({ l, fn }) => (
          <button key={l} onClick={fn} style={{ width: 44, height: 44, borderRadius: 12, background: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.10)', fontSize: 20, fontWeight: 600, color: '#18181B' }}>{l}</button>
        ))}
        <button onClick={() => setIsDarkMode(m => !m)} title={isDarkMode ? 'Switch to light map' : 'Switch to dark map'}
          style={{ width: 44, height: 44, borderRadius: 12, background: isDarkMode ? '#1E293B' : 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.10)', color: isDarkMode ? '#F8FAFC' : '#78716C' }}>
          {isDarkMode ? (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          ) : (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
            </svg>
          )}
        </button>
      </div>

      {/* ── LANG TOGGLE (top-right) ─────────────────────────────── */}
      <div style={{ position: 'fixed', top: 20, right: 16, zIndex: 600, display: 'flex', borderRadius: 9999, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.10)', border: '1px solid #E5E7EB', background: 'white', fontFamily: 'Manrope, sans-serif' }}>
        {(['en', 'ml'] as const).map((l) => (
          <button key={l} onClick={() => setLang(l)}
            style={{ padding: '0 14px', height: 36, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, letterSpacing: '0.3px', background: lang === l ? '#1E293B' : 'white', color: lang === l ? 'white' : '#6B7280', transition: 'background 0.15s, color 0.15s' }}>
            {l === 'en' ? 'EN' : 'മല'}
          </button>
        ))}
      </div>

      {/* ── LIVE DISCOVERIES TRIGGER BUTTON ─────────────────────── */}
      <AnimatePresence>
        {hasSearchedLocation && !spotsOpen && !selectedSpot && !addOpen && (
          <motion.button
            key="spots-trigger"
            initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            onClick={() => setSpotsOpen(true)}
            style={{
              position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
              zIndex: 450, height: 44, padding: '0 20px',
              borderRadius: 999, background: 'white',
              border: '1px solid #E5E7EB',
              boxShadow: '0 4px 20px rgba(0,0,0,0.10)',
              display: 'flex', alignItems: 'center', gap: 8,
              cursor: 'pointer', fontFamily: 'Manrope, sans-serif',
              fontSize: 13, fontWeight: 700, color: '#111827',
            }}
          >
            <span>🔥</span>
            <span>Live Discoveries Near You</span>
            {nearbyCount > 0 && <span style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 600 }}>· {nearbyCount}</span>}
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── LIVE DISCOVERIES SIDEBAR ─────────────────────────────── */}
      <AnimatePresence>
        {spotsOpen && !addOpen && (
          <LiveDiscoveriesSidebar
            key="spots-sidebar"
            spots={spots}
            centerLat={centerLat} centerLng={centerLng}
            onClose={() => setSpotsOpen(false)}
            onPanTo={(lat, lng) => mapRef.current?.panTo([lat, lng], { animate: true, duration: 0.5 })}
            onConfirm={(id) => confirmMutation.mutate(id)}
          />
        )}
      </AnimatePresence>

      {/* ── DISCOVERY CARD (marker click) ───────────────────────── */}
      <AnimatePresence>
        {selectedSpot && (() => {
          const live = spots.find(s => s.id === selectedSpot.id) ?? selectedSpot
          return (
            <DiscoveryCard
              key={`discovery-${selectedSpot.id}`}
              spot={live}
              userLat={userLat} userLng={userLng}
              onClose={() => setSelectedSpot(null)}
              onConfirm={(id) => confirmMutation.mutate(id)}
              onNotHere={(id) => notHereMutation.mutate(id)}
            />
          )
        })()}
      </AnimatePresence>

      {/* ── ADD DISCOVERY SIDE SHEET ─────────────────────────────── */}
      <AnimatePresence>
        {addOpen && (
          <motion.div
            key="add-sheet"
            initial={{ x: 460, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 460, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            style={{
              position: 'absolute', top: 16, right: 16, bottom: 16,
              width: 420, borderRadius: 28, background: 'white',
              boxShadow: '0 20px 80px rgba(0,0,0,0.14)',
              zIndex: 600, display: 'flex', flexDirection: 'column',
            }}
            className="fs-modal-card"
          >
            <AddDiscoverySheet
              lat={pendingLat} lng={pendingLng} address={pendingAddress}
              fileRef={addFileRef}
              isPending={addMutation.isPending}
              onSubmit={handleDiscoverySubmit}
              onClose={closeAdd}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
