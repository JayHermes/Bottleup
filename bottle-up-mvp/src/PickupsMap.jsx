// Split into its own file deliberately: mapbox-gl is a large WebGL library
// (~2MB). Loading it here means it's only fetched by people who actually
// open a map, not bundled into everyone's initial page load.
import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

// points: [{ lat, lng, popupHtml }] — rendered as green dots.
// myPos: { lat, lng } — rendered as a gold dot, meaning "you" from the
// viewer's perspective (a collector's own GPS position, or a user's stored
// pickup location, depending on who's looking at the map).
export default function PickupsMap({ points, myPos, myPopupHtml }) {
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
      center: myPos ? [myPos.lng, myPos.lat] : points[0] ? [points[0].lng, points[0].lat] : [3.379, 6.524],
      zoom: 12,
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
      const marker = new mapboxgl.Marker({ element: el }).setLngLat([myPos.lng, myPos.lat])
      if (myPopupHtml) marker.setPopup(new mapboxgl.Popup({ offset: 16, closeButton: false }).setHTML(myPopupHtml))
      markersRef.current.push(marker.addTo(map))
    }
    points.forEach(p => {
      const el = document.createElement('div'); el.className = 'mapDot'
      const popup = new mapboxgl.Popup({ offset: 16, closeButton: false }).setHTML(p.popupHtml || '')
      markersRef.current.push(new mapboxgl.Marker({ element: el }).setLngLat([p.lng, p.lat]).setPopup(popup).addTo(map))
    })

    const coordsToFit = [...(myPos ? [[myPos.lng, myPos.lat]] : []), ...points.map(p => [p.lng, p.lat])]
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
