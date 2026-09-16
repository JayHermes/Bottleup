// Split into its own file deliberately: mapbox-gl is a large WebGL library
// (~2MB). Loading it here means it's only fetched by people who actually
// open the collector map, not bundled into everyone's initial page load.
import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

export default function PickupsMap({ points, myPos }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const token = import.meta.env.VITE_MAPBOX_TOKEN

  useEffect(() => {
    if (!token || !containerRef.current || mapRef.current) return
    mapboxgl.accessToken = token
    mapRef.current = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: myPos ? [myPos.lng, myPos.lat] : [3.379, 6.524], // falls back to Lagos if we don't have a position yet
      zoom: 11,
    })
    mapRef.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')
    return () => { mapRef.current?.remove(); mapRef.current = null }
  }, [token])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    if (myPos) {
      const el = document.createElement('div'); el.className = 'mapDot mapDotMe'
      markersRef.current.push(new mapboxgl.Marker({ element: el }).setLngLat([myPos.lng, myPos.lat]).addTo(map))
    }
    points.forEach(p => {
      const el = document.createElement('div'); el.className = 'mapDot'
      const popup = new mapboxgl.Popup({ offset: 16, closeButton: false }).setHTML(`<strong>${p.material_type}</strong><br/>${p.pickup_location} · ${p.estimated_weight_kg} kg`)
      markersRef.current.push(new mapboxgl.Marker({ element: el }).setLngLat([p.longitude, p.latitude]).setPopup(popup).addTo(map))
    })

    const coordsToFit = [...(myPos ? [[myPos.lng, myPos.lat]] : []), ...points.map(p => [p.longitude, p.latitude])]
    if (coordsToFit.length > 1) {
      const bounds = coordsToFit.reduce((b, c) => b.extend(c), new mapboxgl.LngLatBounds(coordsToFit[0], coordsToFit[0]))
      map.fitBounds(bounds, { padding: 50, maxZoom: 14, duration: 0 })
    } else if (coordsToFit.length === 1) {
      map.setCenter(coordsToFit[0])
    }
  }, [points, myPos])

  if (!token) return null
  return <div className="mapShell"><div ref={containerRef} className="mapCanvas" /></div>
}
