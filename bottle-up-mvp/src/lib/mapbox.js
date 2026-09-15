// Thin wrapper around Mapbox's Geocoding API v6.
// Used as a fallback: if someone types a location but doesn't grant GPS,
// we convert their text into approximate coordinates so distance-sorting
// still works for their pickup.
const token = import.meta.env.VITE_MAPBOX_TOKEN

export async function geocode(query) {
  if (!token || !query) return null
  try {
    const url = `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(query)}&country=ng&limit=1&access_token=${token}`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    const feature = data.features?.[0]
    if (!feature) return null
    const [lng, lat] = feature.geometry.coordinates
    return { lat, lng }
  } catch {
    return null
  }
}
