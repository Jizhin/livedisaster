import axios from 'axios'
import type { FoodSpot, DistrictStats, AppStats } from '../types'

const BASE = import.meta.env.VITE_API_BASE_URL ?? ''
const api = axios.create({ baseURL: BASE })

export function imageUrl(path: string): string {
  if (path.startsWith('http')) return path
  return `${BASE}/uploads/${path}`
}

export async function getStats(): Promise<AppStats> {
  const { data } = await api.get<AppStats>('/api/stats')
  return data
}

export async function getDistricts(): Promise<DistrictStats[]> {
  const { data } = await api.get<DistrictStats[]>('/api/districts')
  return data
}

export async function getSpots(district?: string): Promise<FoodSpot[]> {
  const { data } = await api.get<FoodSpot[]>('/api/spots', {
    params: district ? { district } : {},
  })
  return data
}

export async function createSpot(formData: FormData): Promise<FoodSpot> {
  const { data } = await api.post<FoodSpot>('/api/spots', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function confirmSpot(id: number): Promise<FoodSpot> {
  const { data } = await api.post<FoodSpot>(`/api/spots/${id}/confirm`)
  return data
}

export async function notHereSpot(id: number): Promise<FoodSpot> {
  const { data } = await api.post<FoodSpot>(`/api/spots/${id}/not-here`)
  return data
}

export async function getSpotsNearby(lat: number, lng: number, radiusKm = 5): Promise<FoodSpot[]> {
  const { data } = await api.get<FoodSpot[]>('/api/spots/nearby', {
    params: { lat, lng, radius_km: radiusKm },
  })
  return data
}

export async function getSpotsInBounds(swLat: number, swLng: number, neLat: number, neLng: number): Promise<FoodSpot[]> {
  const { data } = await api.get<FoodSpot[]>('/api/spots/map-bounds', {
    params: { sw_lat: swLat, sw_lng: swLng, ne_lat: neLat, ne_lng: neLng },
  })
  return data
}

export async function getHeroBg(): Promise<{ url: string | null }> {
  const { data } = await api.get<{ url: string | null }>('/api/settings/hero-bg')
  return data
}

export async function setHeroBg(url: string): Promise<{ url: string }> {
  const { data } = await api.post<{ url: string }>('/api/settings/hero-bg', { url })
  return data
}

export async function uploadHeroBg(file: File): Promise<{ url: string }> {
  const fd = new FormData()
  fd.append('file', file)
  const { data } = await api.post<{ url: string }>('/api/settings/hero-bg/upload', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}
