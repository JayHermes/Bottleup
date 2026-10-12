import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const EMPTY_POINTS = []

export default function PickupsMap({ points = EMPTY_POINTS, myPos, myPopupText, onSelect }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const selectRef = useRef(onSelect)
  const [tileError, setTileError] = useState(false)
  selectRef.current = onSelect

  useEffect(() => {
    const map = L.map(containerRef.current).setView([6.524, 3.379], 12)
    mapRef.current = map
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map)
    tiles.on('tileerror', () => setTileError(true))
    map.on('click', event => selectRef.current?.({ lat: event.latlng.lat, lng: event.latlng.lng }))
    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(containerRef.current)
    return () => { observer.disconnect(); map.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const layer = L.layerGroup().addTo(map)
    const positions = []
    const add = (position, isMe, popupText) => {
      const lat = Number(position.lat), lng = Number(position.lng)
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return
      const point = [lat, lng]
      positions.push(point)
      const marker = L.marker(point, { icon: L.divIcon({ className: `mapDot${isMe ? ' mapDotMe' : ''}`, iconSize: [16, 16], iconAnchor: [8, 8] }), keyboard: true }).addTo(layer)
      if (popupText) {
        const text = document.createElement('span')
        text.textContent = String(popupText)
        marker.bindPopup(text)
      }
    }
    if (myPos) add(myPos, true, myPopupText)
    points.forEach(point => add(point, false, point.popupText))
    if (positions.length > 1) map.fitBounds(positions, { padding: [40, 40], maxZoom: 14 })
    else if (positions.length === 1) map.setView(positions[0], 15)
    return () => layer.remove()
  }, [points, myPos, myPopupText])

  return <div className="mapShell"><div ref={containerRef} className="mapCanvas" aria-label={onSelect ? 'Choose pickup location on the map' : 'Pickup locations map'} />{tileError && <div className="formNote" role="status">Map tiles could not load. Check your connection. {myPos && `Selected location: ${Number(myPos.lat).toFixed(5)}, ${Number(myPos.lng).toFixed(5)}.`}</div>}</div>
}
