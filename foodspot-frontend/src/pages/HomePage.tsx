import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { getStats, getDistricts, getHeroBg } from '../api/client'
import ShareModal from '../components/ShareModal'
import DistrictModal from '../components/DistrictModal'
import { useLanguage } from '../context/LanguageContext'

/* ── Districts ─────────────────────────────────────────────── */
const DISTRICTS_ORDER = [
  'Kasaragod', 'Kannur', 'Wayanad', 'Kozhikode', 'Malappuram',
  'Palakkad', 'Thrissur', 'Ernakulam', 'Idukki', 'Kottayam',
  'Alappuzha', 'Pathanamthitta', 'Kollam', 'Thiruvananthapuram',
]

const DISTRICT_IMAGES: Record<string, string> = {
  Kasaragod:          'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&q=75',
  Kannur:             'https://images.unsplash.com/photo-1519451241324-20b4ea2c4220?w=600&q=75',
  Wayanad:            'https://images.unsplash.com/photo-1511497584788-876760111969?w=600&q=75',
  Kozhikode:          'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=600&q=75',
  Malappuram:         'https://images.unsplash.com/photo-1501555088652-021faa106b9b?w=600&q=75',
  Palakkad:           'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&q=75',
  Thrissur:           'https://images.unsplash.com/photo-1545506738-f50c7f4f89cc?w=600&q=75',
  Ernakulam:          'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=600&q=75',
  Idukki:             'https://images.unsplash.com/photo-1576995853123-5a10305d93c0?w=600&q=75',
  Kottayam:           'https://images.unsplash.com/photo-1582972236019-ea4af5ffe587?w=600&q=75',
  Alappuzha:          'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=75',
  Pathanamthitta:     'https://images.unsplash.com/photo-1503220317375-aca2dfc2d522?w=600&q=75',
  Kollam:             'https://images.unsplash.com/photo-1513467535987-fd81bc7d62f8?w=600&q=75',
  Thiruvananthapuram: 'https://images.unsplash.com/photo-1548013441-4ecf3c1ec46b?w=600&q=75',
}

/* ── Category chip icons (labels come from translations) ──────── */
const CATEGORY_ICONS = ['☕', '🍌', '🍛', '🥐', '🌙', '📍']

const AVATAR_COLORS = ['#C2410C', '#D97706', '#4D7C0F', '#7C3AED']

/* ── Count-up ───────────────────────────────────────────────── */
function useCountUp(target: number, duration = 2200) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (target === 0) return
    let cur = 0
    const step = target / (duration / 16)
    const timer = setInterval(() => {
      cur += step
      if (cur >= target) { setCount(target); clearInterval(timer) }
      else setCount(Math.floor(cur))
    }, 16)
    return () => clearInterval(timer)
  }, [target, duration])
  return count
}

/* ── Page ───────────────────────────────────────────────────── */
export default function HomePage({ onSwitchToMap }: { onSwitchToMap: () => void }) {
  const { lang, setLang, t } = useLanguage()
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null)
  const [shareDistrict, setShareDistrict] = useState<string | null>(null)
  const districtRef = useRef<HTMLDivElement>(null)

  const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: getStats })
  const { data: districts = [] } = useQuery({ queryKey: ['districts'], queryFn: getDistricts })
  const { data: heroBg } = useQuery({ queryKey: ['hero-bg'], queryFn: getHeroBg })

  const totalCount = useCountUp(stats?.total_spots ?? 0)
  const countMap = Object.fromEntries(districts.map((d) => [d.district, d.count]))

  return (
    <div style={{ fontFamily: 'Manrope, Inter, sans-serif', backgroundColor: '#FAF7F2' }}>

      {/* ══════════════════════ HERO — 100vh ═══════════════════ */}
      {/*
          Background image: Kerala food arrangement (tea glass, pazhampori,
          brass plate, unniyappam on cream background).
          Place file at: foodspot-frontend/public/hero-food-background.png
      */}
      <section
        style={{
          height: '100vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          backgroundImage: heroBg?.url ? `url(${heroBg.url})` : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundColor: '#FAF7F2',
        }}
      >
        {/* Warm overlay — 72% opacity so image frames page without overpowering CTA */}
        <div
          style={{
            position: 'absolute', inset: 0,
            backgroundColor: 'rgba(250,247,242,0.72)',
            pointerEvents: 'none', zIndex: 1,
          }}
        />

        {/* ── Navigation ───────────────────────────────────── */}
        <nav
          style={{
            position: 'relative', zIndex: 10, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '16px 40px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                background: 'linear-gradient(148deg, #D97706, #C2410C)',
                boxShadow: '0 4px 14px rgba(194,65,12,0.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 2C7.477 2 4 5.477 4 10c0 5.5 8 12 8 12s8-6.5 8-12c0-4.523-3.477-8-8-8z" fill="white" />
                <circle cx="12" cy="10" r="2.5" fill="rgba(90,15,0,0.35)" />
              </svg>
            </div>
            <div style={{ lineHeight: 1.1 }}>
              <div style={{ fontWeight: 800, color: '#18181B', fontSize: 15, letterSpacing: '-0.02em' }}>FoodSpot</div>
              <div style={{ fontWeight: 700, color: '#C2410C', fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase' }}>UNDO?</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Map View toggle */}
          <motion.button
            onClick={onSwitchToMap}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            style={{
              height: 48, padding: '0 20px', borderRadius: 9999,
              background: 'white', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 8,
              boxShadow: '0 2px 14px rgba(0,0,0,0.09)',
              fontFamily: 'inherit', fontWeight: 700, fontSize: 13, color: '#18181B',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EA580C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
              <line x1="9" y1="3" x2="9" y2="18"/>
              <line x1="15" y1="6" x2="15" y2="21"/>
            </svg>
            Map View
          </motion.button>

          <div
            style={{
              display: 'flex', alignItems: 'center',
              height: 48, borderRadius: 9999,
              background: 'white',
              boxShadow: '0 2px 14px rgba(0,0,0,0.09)',
              padding: 4, gap: 2,
            }}
          >
            {(['en', 'ml'] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                style={{
                  height: 40, padding: '0 18px', borderRadius: 9999,
                  background: lang === l
                    ? 'linear-gradient(135deg, #F97316, #C2410C)'
                    : 'transparent',
                  border: 'none', cursor: 'pointer',
                  fontWeight: 700, fontSize: 13, letterSpacing: '0.06em',
                  color: lang === l ? 'white' : '#78716C',
                  fontFamily: 'inherit',
                  transition: 'all 0.2s',
                }}
              >
                {l === 'en' ? 'EN' : 'ML'}
              </button>
            ))}
          </div>
          </div>
        </nav>

        {/* ── Hero content ─────────────────────────────────── */}
        {/*
            max-width 900px centers content in the open space of the background image.

            Spacing uses CSS min() for viewport-height-aware gaps:
            min(Npx, X.Xvh) → on 1366×768 laptop the vh value is smaller,
            automatically compressing gaps so everything stays in 100vh.
        */}
        <div
          style={{
            position: 'relative', zIndex: 10,
            flex: 1, minHeight: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            maxWidth: 900, width: '100%',
            margin: '0 auto', padding: '0 24px',
            textAlign: 'center',
          }}
        >

          {/* TITLE — 96px desktop, 56px mobile, lh 0.95, weight 800 */}
          <div style={{ marginBottom: 'min(24px, 2.7vh)' }}>
            <div
              style={{
                fontSize: 'clamp(3.5rem, 11vmin, 6rem)',
                lineHeight: 0.95,
                fontWeight: 800,
                color: '#18181B',
                letterSpacing: '-0.025em',
              }}
            >
              FOOD SPOT
            </div>
            <div
              style={{
                fontSize: 'clamp(3.5rem, 11vmin, 6rem)',
                lineHeight: 0.95,
                fontWeight: 800,
                color: '#C2410C',
                letterSpacing: '-0.025em',
              }}
            >
              UNDO?
            </div>
          </div>

          {/* SUBTITLE — 28px desktop, weight 600 */}
          <p
            style={{
              margin: 0,
              fontSize: 'clamp(1.2rem, 3.2vmin, 1.75rem)',
              fontWeight: 600,
              color: '#18181B',
              marginBottom: 'min(12px, 1.35vh)',
            }}
          >
            {t.subtitle}
          </p>

          {/* SUPPORTING TEXT — 20px desktop */}
          <p
            style={{
              margin: 0,
              fontSize: 'clamp(0.875rem, 2vmin, 1.25rem)',
              color: '#78716C',
              marginBottom: 'min(32px, 3.6vh)',
            }}
          >
            {t.supporting}{' '}
            <span style={{ color: '#C2410C' }}>♥</span>
          </p>

          {/* SHARE DISCOVERY CIRCLE — primary visual element */}
          {/*
              Size via 30vh so it scales with screen height:
              1440×900 → 270px | 1366×768 → 230px | 1920×1080 → capped 280px
          */}
          <div
            style={{
              position: 'relative',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              marginBottom: 'min(20px, 2.25vh)',
            }}
          >
            {/* Ambient glow */}
            <div
              style={{
                position: 'absolute',
                width: 'clamp(280px, calc(30vh + 90px), 380px)',
                height: 'clamp(280px, calc(30vh + 90px), 380px)',
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(245,158,11,0.10) 0%, rgba(194,65,12,0.04) 55%, transparent 72%)',
              }}
            />

            {/* Outer pulsing ring */}
            <motion.div
              style={{
                position: 'absolute',
                width: 'clamp(255px, calc(30vh + 55px), 335px)',
                height: 'clamp(255px, calc(30vh + 55px), 335px)',
                borderRadius: '50%',
                border: '1.5px solid rgba(245,158,11,0.30)',
              }}
              animate={{ scale: [1, 1.06, 1], opacity: [0.5, 0.07, 0.5] }}
              transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
            />

            {/* Inner static ring */}
            <div
              style={{
                position: 'absolute',
                width: 'clamp(230px, calc(30vh + 30px), 310px)',
                height: 'clamp(230px, calc(30vh + 30px), 310px)',
                borderRadius: '50%',
                border: '1px solid rgba(245,158,11,0.18)',
              }}
            />

            {/* THE CIRCLE */}
            <motion.button
              onClick={() => setModalOpen(true)}
              style={{
                width: 'clamp(200px, 30vh, 280px)',
                height: 'clamp(200px, 30vh, 280px)',
                borderRadius: '50%',
                background: 'linear-gradient(155deg, #F59E0B 0%, #D97706 32%, #C2410C 100%)',
                border: 'none', cursor: 'pointer',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                position: 'relative', flexShrink: 0,
                fontFamily: 'inherit',
              }}
              animate={{
                scale: [1, 1.02, 1],
                boxShadow: [
                  '0 20px 60px rgba(194,65,12,0.18), inset 0 1px 0 rgba(255,255,255,0.12)',
                  '0 24px 70px rgba(194,65,12,0.26), inset 0 1px 0 rgba(255,255,255,0.12)',
                  '0 20px 60px rgba(194,65,12,0.18), inset 0 1px 0 rgba(255,255,255,0.12)',
                ],
              }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.97 }}
            >
              {/* Dashed inner ring */}
              <div
                style={{
                  position: 'absolute', inset: 18, borderRadius: '50%',
                  border: '1.5px dashed rgba(255,255,255,0.28)',
                }}
              />

              {/* Top-left highlight */}
              <div
                style={{
                  position: 'absolute',
                  width: '38%', height: '38%', top: '9%', left: '10%',
                  borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(255,255,255,0.18) 0%, transparent 70%)',
                }}
              />

              {/* Camera icon */}
              <svg
                viewBox="0 0 24 24" fill="none" stroke="white"
                strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
                style={{
                  width: 52, height: 52, flexShrink: 0,
                  filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.22))',
                  marginBottom: 8,
                }}
              >
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>

              <span
                style={{
                  color: 'white', fontWeight: 700, lineHeight: 1.2,
                  fontSize: 'clamp(0.8rem, 1.8vmin, 1rem)',
                  letterSpacing: '0.06em',
                  textShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }}
              >
                {t.share_cta_l1}<br />{t.share_cta_l2}
              </span>
            </motion.button>
          </div>

          {/* COMMUNITY COUNTER */}
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
              marginBottom: 'min(24px, 2.7vh)',
            }}
          >
            <div style={{ display: 'flex' }}>
              {AVATAR_COLORS.map((color, i) => (
                <div
                  key={i}
                  style={{
                    width: 32, height: 32, borderRadius: '50%',
                    backgroundColor: color,
                    border: '2.5px solid rgba(250,247,242,0.92)',
                    marginLeft: i > 0 ? -10 : 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontWeight: 700, fontSize: 10, flexShrink: 0,
                  }}
                >
                  {['R', 'A', 'M', 'S'][i]}
                </div>
              ))}
            </div>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 500, color: '#18181B' }}>
              {lang === 'en' ? (
                <>
                  <strong style={{ fontWeight: 800 }}>
                    {totalCount > 0 ? totalCount.toLocaleString() : '2,843'}
                  </strong>{' '}
                  food spots shared across{' '}
                  <span style={{ color: '#C2410C', fontWeight: 700 }}>Kerala</span>
                </>
              ) : (
                <>
                  <strong style={{ fontWeight: 800 }}>
                    {totalCount > 0 ? totalCount.toLocaleString() : '2,843'}
                  </strong>{' '}
                  ഭക്ഷണ സ്ഥലങ്ങൾ{' '}
                  <span style={{ color: '#C2410C', fontWeight: 700 }}>കേരളത്തിൽ</span>
                </>
              )}
            </p>
          </div>

          {/* CATEGORY CHIPS */}
          <div
            style={{
              display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center',
              marginBottom: 'min(20px, 2.25vh)',
            }}
          >
            {CATEGORY_ICONS.map((icon, i) => (
              <motion.button
                key={icon}
                style={{
                  height: 44, padding: '0 18px', borderRadius: 9999,
                  background: 'rgba(255,255,255,0.90)',
                  border: '1.5px solid #E7E5E4',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 8,
                  fontSize: 14, fontWeight: 600, color: '#18181B',
                  fontFamily: 'inherit', flexShrink: 0,
                  backdropFilter: 'blur(10px)',
                }}
                whileHover={{
                  borderColor: '#C2410C',
                  backgroundColor: 'rgba(254,242,232,0.96)',
                  color: '#C2410C',
                }}
                transition={{ duration: 0.15 }}
              >
                <span style={{ fontSize: 17, lineHeight: 1 }}>{icon}</span>
                {t.categories[i]}
              </motion.button>
            ))}
          </div>

          {/* SCROLL INDICATOR */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ height: 1, width: 22, background: 'linear-gradient(to right, transparent, rgba(194,65,12,0.45))' }} />
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.10em', color: '#78716C' }}>
                {t.scroll}
              </span>
              <div style={{ height: 1, width: 22, background: 'linear-gradient(to left, transparent, rgba(194,65,12,0.45))' }} />
            </div>
            <motion.div
              onClick={() => districtRef.current?.scrollIntoView({ behavior: 'smooth' })}
              style={{
                width: 36, height: 36, borderRadius: '50%',
                border: '1.5px solid #E7E5E4',
                background: 'rgba(255,255,255,0.90)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#78716C',
                backdropFilter: 'blur(8px)',
              }}
              animate={{ y: [0, 6, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </motion.div>
          </div>

        </div>
      </section>

      {/* ═══════════════ EXPLORE KERALA — starts right after hero ══ */}
      <div ref={districtRef} style={{ backgroundColor: '#FAF7F2', padding: '64px 24px 96px' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>

          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ height: 1, width: 28, backgroundColor: '#C2410C', opacity: 0.5 }} />
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.22em', color: '#C2410C', textTransform: 'uppercase' }}>
                {t.explore_label}
              </span>
              <div style={{ height: 1, width: 28, backgroundColor: '#C2410C', opacity: 0.5 }} />
            </div>
            <h2
              style={{
                margin: 0,
                fontSize: 'clamp(1.75rem, 4vw, 3rem)',
                fontWeight: 800, color: '#18181B', lineHeight: 1.15,
              }}
            >
              {t.discover_head}{' '}
              <span style={{ color: '#C2410C' }}>{t.discover_mark}</span>
            </h2>
          </div>

          {/* 14 districts — 4 columns desktop, 2 tablet, 1 mobile via auto-fill */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: 16,
            }}
          >
            {DISTRICTS_ORDER.map((name) => {
              const count = countMap[name] ?? 0
              return (
                <motion.div
                  key={name}
                  onClick={() => setSelectedDistrict(name)}
                  style={{
                    position: 'relative', height: 220,
                    borderRadius: 24, overflow: 'hidden', cursor: 'pointer',
                  }}
                  whileHover={{ scale: 1.02 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                >
                  <img
                    src={DISTRICT_IMAGES[name]}
                    alt={name}
                    loading="lazy"
                    style={{
                      position: 'absolute', inset: 0,
                      width: '100%', height: '100%', objectFit: 'cover',
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute', inset: 0,
                      background: 'linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.18) 55%, transparent 100%)',
                    }}
                  />
                  <div style={{ position: 'absolute', bottom: 0, left: 0, padding: '20px 22px' }}>
                    <h3 style={{ color: 'white', fontWeight: 800, fontSize: 18, letterSpacing: lang === 'en' ? '0.05em' : 0, margin: '0 0 4px' }}>
                      {lang === 'en' ? name.toUpperCase() : t.districts[name]}
                    </h3>
                    <p style={{ color: 'rgba(255,255,255,0.70)', fontSize: 13, fontWeight: 500, margin: 0 }}>
                      {count > 0 ? t.discoveries(count) : t.first}
                    </p>
                  </div>
                  <div
                    style={{
                      position: 'absolute', bottom: 20, right: 20,
                      width: 34, height: 34, borderRadius: '50%',
                      background: 'rgba(255,255,255,0.18)',
                      backdropFilter: 'blur(8px)',
                      border: '1px solid rgba(255,255,255,0.28)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>
      </div>

      <ShareModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        initialDistrict={shareDistrict ?? undefined}
      />

      <DistrictModal
        district={selectedDistrict}
        onClose={() => setSelectedDistrict(null)}
        onShare={(d) => { setShareDistrict(d ?? null); setSelectedDistrict(null); setModalOpen(true) }}
      />

    </div>
  )
}
