export const FALLBACK_IMAGES = [
  'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=500&q=75',
  'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=500&q=75',
  'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500&q=75',
  'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500&q=75',
  'https://images.unsplash.com/photo-1563245372-f21724e3856d?w=500&q=75',
]

export function getFallbackImage(spotId: number, category?: string | null): string {
  if (category) {
    const c = category.toLowerCase()
    if (c.includes('tea') || c.includes('chai')) return FALLBACK_IMAGES[0]
    if (c.includes('meal') || c.includes('rice') || c.includes('biryani')) return FALLBACK_IMAGES[1]
    if (c.includes('bak') || c.includes('sweet')) return FALLBACK_IMAGES[2]
    if (c.includes('snack') || c.includes('street')) return FALLBACK_IMAGES[3]
  }
  return FALLBACK_IMAGES[spotId % FALLBACK_IMAGES.length]
}

const AUTHORS = [
  'Anu M.', 'Rahul R.', 'Jithin K.', 'Niyas N.', 'Sreejith P.',
  'Remya K.', 'Muhammed A.', 'Priya V.', 'Anoop S.', 'Divya T.',
]
const AVATAR_COLORS = ['#C2410C', '#D97706', '#4D7C0F', '#7C3AED', '#0369A1', '#0F766E']

export const getAuthor = (id: number) => AUTHORS[id % AUTHORS.length]
export const getAvatarColor = (id: number) => AVATAR_COLORS[id % AVATAR_COLORS.length]
export const getAvatarInitial = (id: number) => AUTHORS[id % AUTHORS.length][0]

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const h = Math.floor(diff / 3600000)
  const d = Math.floor(diff / 86400000)
  if (h < 1) return 'Just now'
  if (h < 24) return `${h}h ago`
  if (d < 7) return `${d}d ago`
  return `${Math.floor(d / 7)}w ago`
}

export function getPlaceShort(locationText?: string | null, maxLen = 25): string {
  if (!locationText) return ''
  return locationText.split(',')[0].trim().slice(0, maxLen)
}

const IMG_HEIGHTS = [220, 280, 200, 260, 240, 300, 210]
export const cardImageHeight = (index: number) => IMG_HEIGHTS[index % IMG_HEIGHTS.length]
