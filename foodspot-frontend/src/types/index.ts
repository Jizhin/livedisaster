export interface FoodSpot {
  id: number
  title: string
  description?: string
  image_path?: string
  latitude?: number
  longitude?: number
  location_text?: string
  district?: string
  category?: string
  confirmed_count: number
  not_here_count?: number
  created_at: string
  expires_at?: string
}

export interface DistrictStats {
  district: string
  count: number
}

export interface AppStats {
  total_spots: number
}
