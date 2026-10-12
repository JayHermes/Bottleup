export function getCurrentLocation() {
  if (!globalThis.isSecureContext) return Promise.reject(new Error('Location needs a secure connection. Open this app using HTTPS.'))
  if (!navigator.geolocation) return Promise.reject(new Error('Location is not available on this device. Choose your pickup location on the map.'))
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      position => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      error => reject(new Error(error.code === 1
        ? 'Location access is blocked. Allow location in your browser settings, then retry, or choose a point on the map.'
        : error.code === 3
          ? 'Getting your location took too long. Retry or choose a point on the map.'
          : 'Your device could not find its location. Check that location services are enabled, or choose a point on the map.')),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    )
  })
}
