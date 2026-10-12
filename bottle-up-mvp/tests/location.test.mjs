import test from 'node:test'
import assert from 'node:assert/strict'
import { getCurrentLocation } from '../src/lib/location.js'

test('location capture and actionable failures', async () => {
  const secure = Object.getOwnPropertyDescriptor(globalThis, 'isSecureContext')
  const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const setDevice = geolocation => Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { geolocation } })
  try {
    Object.defineProperty(globalThis, 'isSecureContext', { configurable: true, value: false })
    await assert.rejects(getCurrentLocation(), /HTTPS/)
    Object.defineProperty(globalThis, 'isSecureContext', { configurable: true, value: true })
    setDevice(undefined)
    await assert.rejects(getCurrentLocation(), /not available/)
    for (const [code, message] of [[1, /browser settings/], [2, /location services/], [3, /too long/]]) {
      setDevice({ getCurrentPosition: (_, fail) => fail({ code }) })
      await assert.rejects(getCurrentLocation(), message)
    }
    setDevice({ getCurrentPosition: (success, _, options) => {
      assert.equal(options.enableHighAccuracy, true)
      assert.equal(options.maximumAge, 0)
      success({ coords: { latitude: 6.5, longitude: 3.4 } })
    } })
    assert.deepEqual(await getCurrentLocation(), { lat: 6.5, lng: 3.4 })
  } finally {
    if (secure) Object.defineProperty(globalThis, 'isSecureContext', secure)
    else delete globalThis.isSecureContext
    if (nav) Object.defineProperty(globalThis, 'navigator', nav)
    else delete globalThis.navigator
  }
})
