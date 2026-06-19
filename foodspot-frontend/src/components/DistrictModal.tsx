import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { getSpots, imageUrl } from '../api/client'
import type { FoodSpot } from '../types'
import SpotDetailModal from './SpotDetailModal'
import {
  getFallbackImage, getAuthor, getAvatarColor, getAvatarInitial, timeAgo, getPlaceShort,
} from '../utils/spotHelpers'

interface Props {
  district: string | null
  onClose: () => void
  onShare: (district?: string) => void
}

type Sort = 'recent' | 'popular' | 'confirmed'

/* ── Spot Card ────────────────────────────────────────────────── */
function SpotCard({ spot, onClick }: { spot: FoodSpot; onClick: () => void }) {
  const imgSrc = spot.image_path ? imageUrl(spot.image_path) : getFallbackImage(spot.id, spot.category)
  const placeShort = getPlaceShort(spot.location_text)

  return (
    <motion.div
      onClick={onClick}
      whileHover={{ y: -4, scale: 1.01 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      style={{
        borderRadius: 24, overflow: 'hidden', cursor: 'pointer',
        position: 'relative', height: 280,
        boxShadow: '0 10px 30px rgba(0,0,0,0.08)',
        backgroundColor: '#1a1a1a',
      }}
    >
      {/* Image fills full card */}
      <img
        src={imgSrc}
        alt={spot.title}
        loading="lazy"
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        onError={(e) => { e.currentTarget.src = getFallbackImage(spot.id, null) }}
      />

      {/* Dark gradient overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.18) 52%, transparent 100%)',
      }} />

      {/* Confirmation badge — top right */}
      <div style={{
        position: 'absolute', top: 12, right: 12,
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        borderRadius: 999, padding: '5px 11px',
        fontSize: 13, fontWeight: 700, color: '#18181B',
        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
        display: 'flex', alignItems: 'center', gap: 4,
      }}>
        👍 {spot.confirmed_count}
      </div>

      {/* Bottom content overlay */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 14px 14px' }}>
        {/* Location */}
        {placeShort && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5 }}>
            <svg width="10" height="13" viewBox="0 0 10 13" fill="#EA580C">
              <path d="M5 0C2.24 0 0 2.24 0 5c0 3.75 5 8 5 8s5-4.25 5-8c0-2.76-2.24-5-5-5z" />
              <circle cx="5" cy="5" r="1.8" fill="white" />
            </svg>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#EA580C' }}>{placeShort}</span>
          </div>
        )}

        {/* Title */}
        <h3 style={{
          margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: 'white',
          lineHeight: 1.25,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {spot.title}
        </h3>

        {/* Description */}
        {spot.description && (
          <p style={{
            margin: '0 0 8px', fontSize: 14, color: 'rgba(255,255,255,0.90)',
            lineHeight: 1.4,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {spot.description}
          </p>
        )}

        {/* Author */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 22, height: 22, borderRadius: '50%',
            backgroundColor: getAvatarColor(spot.id),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontWeight: 700, fontSize: 9, flexShrink: 0,
          }}>
            {getAvatarInitial(spot.id)}
          </div>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>
            Shared {timeAgo(spot.created_at)} by {getAuthor(spot.id)}
          </span>
        </div>
      </div>
    </motion.div>
  )
}

/* ── Empty State ──────────────────────────────────────────────── */
function EmptyState({ onShare }: { onShare: () => void }) {
  return (
    <div style={{
      textAlign: 'center', padding: '80px 40px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: 300,
    }}>
      <div style={{ fontSize: 64, marginBottom: 20, lineHeight: 1 }}>🍽️</div>
      <h3 style={{ fontSize: 22, fontWeight: 800, color: '#18181B', margin: '0 0 10px' }}>
        No food discoveries yet
      </h3>
      <p style={{ fontSize: 15, color: '#78716C', margin: '0 0 32px', maxWidth: 280 }}>
        Be the first to share a hidden food spot in this district.
      </p>
      <button
        onClick={onShare}
        style={{
          height: 52, padding: '0 36px', borderRadius: 999,
          background: 'linear-gradient(135deg, #F97316, #EA580C)',
          border: 'none', cursor: 'pointer',
          fontWeight: 700, fontSize: 15, color: 'white',
          fontFamily: 'Manrope, sans-serif',
          boxShadow: '0 12px 32px rgba(234,88,12,0.25)',
        }}
      >
        Share Discovery
      </button>
    </div>
  )
}

/* ── Main Component ───────────────────────────────────────────── */
export default function DistrictModal({ district, onClose, onShare }: Props) {
  const [search, setSearch] = useState('')
  const [placeFilter, setPlaceFilter] = useState<string | null>(null)
  const [sort, setSort] = useState<Sort>('recent')
  const [selectedSpot, setSelectedSpot] = useState<FoodSpot | null>(null)

  const { data: spots = [], isLoading } = useQuery({
    queryKey: ['spots', district],
    queryFn: () => getSpots(district!),
    enabled: !!district,
  })

  useEffect(() => {
    if (!district) return
    setSearch('')
    setPlaceFilter(null)
    setSort('recent')
    setSelectedSpot(null)
  }, [district])

  useEffect(() => {
    if (!district) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !selectedSpot) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [district, onClose, selectedSpot])

  /* ── Place chips derived from location_text ─────────────────── */
  const places = useMemo(() => {
    const map: Record<string, number> = {}
    spots.forEach((spot) => {
      if (!spot.location_text) return
      const raw = spot.location_text.split(',')[0].trim()
      if (raw.length < 2 || raw.length > 38 || /^\d/.test(raw)) return
      map[raw] = (map[raw] ?? 0) + 1
    })
    return Object.entries(map).sort(([, a], [, b]) => b - a).slice(0, 8)
  }, [spots])

  /* ── Filter + sort ──────────────────────────────────────────── */
  const filtered = useMemo(() => {
    let list = [...spots]
    if (placeFilter) {
      list = list.filter((s) => s.location_text?.toLowerCase().includes(placeFilter.toLowerCase()))
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((s) =>
        s.title.toLowerCase().includes(q) ||
        s.description?.toLowerCase().includes(q) ||
        s.location_text?.toLowerCase().includes(q) ||
        s.category?.toLowerCase().includes(q)
      )
    }
    if (sort === 'recent') {
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    } else {
      list.sort((a, b) => (b.confirmed_count ?? 0) - (a.confirmed_count ?? 0))
    }
    return list
  }, [spots, placeFilter, search, sort])

  return (
    <AnimatePresence>
      {district && (
        <motion.div
          key="district-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{
            position: 'fixed', inset: 0, zIndex: 900,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.35)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            padding: '16px',
          }}
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            key="district-card"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 280 }}
            style={{
              width: '84vw', maxWidth: 1160,
              height: '82vh',
              borderRadius: 32,
              backgroundColor: '#FAF7F2',
              boxShadow: '0 40px 120px rgba(0,0,0,0.15)',
              overflow: 'hidden',
              display: 'flex', flexDirection: 'column',
              fontFamily: 'Manrope, "Noto Sans Malayalam", sans-serif',
            }}
          >

            {/* ── HEADER — 80px compact ────────────────────────── */}
            <div style={{
              height: 80, flexShrink: 0,
              display: 'flex', alignItems: 'center',
              padding: '0 24px', gap: 16,
              borderBottom: '1px solid #ECEAE5',
              backgroundColor: '#FAF7F2',
            }}>

              {/* Left: close */}
              <button
                onClick={onClose}
                style={{
                  width: 56, height: 56, borderRadius: '50%',
                  background: 'white', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 2px 12px rgba(0,0,0,0.09)', color: '#44403C',
                  flexShrink: 0,
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>

              {/* Center: pin + district + count */}
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <svg width="22" height="28" viewBox="0 0 24 30" fill="none">
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 18 12 18s12-9 12-18C24 5.373 18.627 0 12 0z" fill="#EA580C" />
                  <circle cx="12" cy="12" r="4.5" fill="white" />
                </svg>
                <span style={{ fontSize: 26, fontWeight: 700, color: '#18181B', letterSpacing: '-0.01em' }}>
                  {district}
                </span>
                <span style={{ fontSize: 17, fontWeight: 500, color: '#A8A29E' }}>
                  · {spots.length} discoveries
                </span>
              </div>

              {/* Right: share */}
              <button
                onClick={() => onShare(district ?? undefined)}
                style={{
                  height: 52, padding: '0 24px', borderRadius: 999,
                  background: 'white', border: '1.5px solid #E7E5E4',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                  fontWeight: 600, fontSize: 15, color: '#18181B', flexShrink: 0,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)', fontFamily: 'inherit',
                }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                Share
              </button>
            </div>

            {/* ── PLACE FILTER CHIPS ──────────────────────────── */}
            <div
              className="chips-row"
              style={{
                flexShrink: 0, display: 'flex', gap: 10, alignItems: 'center',
                padding: '12px 24px', overflowX: 'auto',
              }}
            >
              {[null, ...places.map(([p]) => p)].map((place) => {
                const isSelected = place === placeFilter
                const count = place ? places.find(([p]) => p === place)?.[1] : spots.length
                return (
                  <button
                    key={place ?? '__all'}
                    onClick={() => setPlaceFilter(place)}
                    style={{
                      height: 48, padding: '0 18px', borderRadius: 999,
                      background: isSelected ? '#EA580C' : 'white',
                      border: `1px solid ${isSelected ? '#EA580C' : '#E7E5E4'}`,
                      color: isSelected ? 'white' : '#18181B',
                      cursor: 'pointer', flexShrink: 0,
                      fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center', gap: 8,
                      transition: 'all 0.18s',
                    }}
                  >
                    {place ?? 'All Places'}
                    {count !== undefined && (
                      <span style={{
                        fontSize: 12, fontWeight: 700, lineHeight: 1.4,
                        color: isSelected ? 'rgba(255,255,255,0.85)' : '#A8A29E',
                        background: isSelected ? 'rgba(255,255,255,0.20)' : '#F0EDE8',
                        borderRadius: 999, padding: '2px 8px',
                      }}>
                        {count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* ── SEARCH + SORT ───────────────────────────────── */}
            <div style={{
              flexShrink: 0, display: 'flex', gap: 12, alignItems: 'center',
              padding: '0 24px 12px',
            }}>
              {/* Search */}
              <div style={{ flex: 1, position: 'relative' }}>
                <div style={{
                  position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)',
                  color: '#A8A29E', pointerEvents: 'none',
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </div>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search food spots, places, or dishes..."
                  style={{
                    width: '100%', height: 58, padding: '0 18px 0 48px',
                    border: '1.5px solid #E7E5E4', borderRadius: 18,
                    fontSize: 15, fontWeight: 500, color: '#18181B',
                    backgroundColor: 'white', outline: 'none',
                    fontFamily: 'inherit', boxSizing: 'border-box',
                    transition: 'border-color 0.18s',
                  }}
                  onFocus={(e) => { e.target.style.borderColor = '#D97706' }}
                  onBlur={(e) => { e.target.style.borderColor = '#E7E5E4' }}
                />
              </div>

              {/* Sort chips */}
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                {(['recent', 'popular', 'confirmed'] as Sort[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSort(s)}
                    style={{
                      height: 52, padding: '0 20px', borderRadius: 999,
                      background: sort === s ? '#EA580C' : 'white',
                      border: `1px solid ${sort === s ? '#EA580C' : '#E7E5E4'}`,
                      color: sort === s ? 'white' : '#78716C',
                      cursor: 'pointer', fontWeight: 600, fontSize: 14,
                      fontFamily: 'inherit', flexShrink: 0, transition: 'all 0.18s',
                    }}
                  >
                    {s === 'recent' ? 'Recent' : s === 'popular' ? 'Popular' : 'Most Confirmed'}
                  </button>
                ))}
              </div>
            </div>

            {/* ── DISCOVERY FEED ──────────────────────────────── */}
            <div
              style={{ flex: 1, overflowY: 'auto', padding: '0 24px 24px' }}
              className="fs-modal-card"
            >
              {isLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: 280 }}>
                  <div
                    className="animate-spin"
                    style={{
                      width: 48, height: 48, borderRadius: '50%',
                      border: '3px solid #E7E5E4', borderTopColor: '#EA580C',
                    }}
                  />
                </div>
              ) : filtered.length === 0 ? (
                <EmptyState onShare={() => onShare(district ?? undefined)} />
              ) : (
                <>
                  {/* 4-col grid, responsive */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))',
                    gap: 20,
                  }}>
                    {filtered.map((spot) => (
                      <SpotCard
                        key={spot.id}
                        spot={spot}
                        onClick={() => setSelectedSpot(spot)}
                      />
                    ))}
                  </div>

                  {/* Footer context */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    padding: '28px 0 8px', fontSize: 14, color: '#A8A29E',
                  }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                    You're seeing all spots from{' '}
                    <strong style={{ color: '#EA580C', fontWeight: 600 }}>{district}</strong>
                  </div>
                </>
              )}
            </div>

          </motion.div>

          {/* Secondary detail modal */}
          <SpotDetailModal
            spot={selectedSpot}
            onClose={() => setSelectedSpot(null)}
            onShareClick={() => { setSelectedSpot(null); onShare(district ?? undefined) }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
