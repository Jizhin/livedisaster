import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { confirmSpot, imageUrl } from '../api/client'
import type { FoodSpot } from '../types'
import { getFallbackImage, getPlaceShort, timeAgo, getAuthor, getAvatarColor, getAvatarInitial } from '../utils/spotHelpers'

interface Props {
  spot: FoodSpot | null
  onClose: () => void
  onShareClick: () => void
}

export default function SpotDetailModal({ spot, onClose, onShareClick }: Props) {
  const qc = useQueryClient()
  const [confirmedLocal, setConfirmedLocal] = useState(false)

  useEffect(() => {
    setConfirmedLocal(false)
  }, [spot?.id])

  useEffect(() => {
    if (!spot) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [spot, onClose])

  const confirmMutation = useMutation({
    mutationFn: () => confirmSpot(spot!.id),
    onSuccess: () => {
      setConfirmedLocal(true)
      qc.invalidateQueries({ queryKey: ['spots'] })
      qc.invalidateQueries({ queryKey: ['districts'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    },
  })

  return (
    <AnimatePresence>
      {spot && (
        <motion.div
          key="spot-detail-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: 'fixed', inset: 0, zIndex: 920,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.50)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            padding: 20,
          }}
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            key={`spot-${spot.id}`}
            initial={{ scale: 0.90, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.90, opacity: 0, y: 30 }}
            transition={{ type: 'spring', damping: 24, stiffness: 300 }}
            style={{
              width: '100%', maxWidth: 600,
              maxHeight: '90vh',
              borderRadius: 32,
              backgroundColor: '#FAF7F2',
              boxShadow: '0 25px 80px rgba(0,0,0,0.22)',
              overflow: 'hidden',
              display: 'flex', flexDirection: 'column',
            }}
          >
            {/* Image header */}
            <div style={{ position: 'relative', height: 300, flexShrink: 0 }}>
              <img
                src={spot.image_path ? imageUrl(spot.image_path) : getFallbackImage(spot.id, spot.category)}
                alt={spot.title}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={(e) => { e.currentTarget.src = getFallbackImage(spot.id, null) }}
              />
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.10) 50%, transparent 100%)',
              }} />

              {/* Close */}
              <button
                onClick={onClose}
                style={{
                  position: 'absolute', top: 16, left: 16,
                  width: 44, height: 44, borderRadius: '50%',
                  background: 'rgba(255,255,255,0.90)',
                  backdropFilter: 'blur(8px)',
                  border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#18181B',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>

              {/* Confirmation count */}
              <div style={{
                position: 'absolute', top: 16, right: 16,
                background: 'rgba(255,255,255,0.90)',
                backdropFilter: 'blur(8px)',
                borderRadius: 999, padding: '6px 14px',
                fontSize: 14, fontWeight: 700, color: '#18181B',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                👍 {spot.confirmed_count + (confirmedLocal ? 1 : 0)}
              </div>

              {/* Title overlay */}
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '24px 28px' }}>
                {spot.location_text && (
                  <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                    📍 {getPlaceShort(spot.location_text)}
                  </div>
                )}
                <h2 style={{ color: 'white', fontSize: 26, fontWeight: 800, margin: 0, lineHeight: 1.2 }}>
                  {spot.title}
                </h2>
              </div>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px 32px' }} className="fs-modal-card">

              {/* Author */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  backgroundColor: getAvatarColor(spot.id),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontWeight: 700, fontSize: 13, flexShrink: 0,
                }}>
                  {getAvatarInitial(spot.id)}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#18181B' }}>{getAuthor(spot.id)}</div>
                  <div style={{ fontSize: 12, color: '#A8A29E' }}>Shared {timeAgo(spot.created_at)}</div>
                </div>
              </div>

              {/* Description */}
              {spot.description && (
                <p style={{ fontSize: 16, color: '#78716C', lineHeight: 1.65, margin: '0 0 28px', fontWeight: 400 }}>
                  {spot.description}
                </p>
              )}

              {/* Location detail */}
              {spot.location_text && (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 28,
                  padding: '14px 18px', borderRadius: 16,
                  backgroundColor: 'rgba(194,65,12,0.06)', border: '1px solid rgba(194,65,12,0.12)',
                }}>
                  <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>📍</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#C2410C', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>Location</div>
                    <div style={{ fontSize: 14, color: '#18181B', fontWeight: 500 }}>{spot.location_text}</div>
                    {spot.latitude && spot.longitude && (
                      <a
                        href={`https://maps.google.com/?q=${spot.latitude},${spot.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: 13, color: '#C2410C', fontWeight: 600, display: 'inline-block', marginTop: 6, textDecoration: 'none' }}
                      >
                        Open in Maps →
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Category tag */}
              {spot.category && (
                <div style={{ marginBottom: 28 }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '4px 14px', borderRadius: 999,
                    backgroundColor: 'rgba(194,65,12,0.10)',
                    color: '#C2410C', fontSize: 13, fontWeight: 600,
                  }}>
                    {spot.category}
                  </span>
                </div>
              )}

              {/* Still Active button */}
              <button
                onClick={() => { if (!confirmedLocal && !confirmMutation.isPending) confirmMutation.mutate() }}
                disabled={confirmedLocal || confirmMutation.isPending}
                style={{
                  width: '100%', height: 64, borderRadius: 999, marginBottom: 12,
                  background: confirmedLocal
                    ? 'linear-gradient(135deg, #16A34A, #15803D)'
                    : 'linear-gradient(135deg, #F97316, #EA580C)',
                  border: 'none',
                  cursor: confirmedLocal ? 'default' : 'pointer',
                  fontWeight: 700, fontSize: 16, color: 'white',
                  fontFamily: 'Manrope, "Noto Sans Malayalam", sans-serif',
                  boxShadow: confirmedLocal
                    ? '0 12px 32px rgba(22,163,74,0.20)'
                    : '0 12px 32px rgba(234,88,12,0.22)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  transition: 'all 0.2s',
                }}
              >
                {confirmedLocal ? '✓ Thanks! Confirmed' : confirmMutation.isPending ? 'Confirming...' : '👍 Still Active? Confirm it!'}
              </button>

              {/* Share button */}
              <button
                onClick={onShareClick}
                style={{
                  width: '100%', height: 56, borderRadius: 999,
                  background: 'white', border: '1.5px solid #E7E5E4',
                  cursor: 'pointer', fontWeight: 600, fontSize: 15, color: '#18181B',
                  fontFamily: 'Manrope, "Noto Sans Malayalam", sans-serif',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
                Share Another Discovery
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
