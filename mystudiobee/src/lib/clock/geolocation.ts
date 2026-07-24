/** Resolves once with the device's current coordinates, or null on denial/timeout/
 * unsupported browser. Location is now a required (blocking) part of both clock-in
 * and clock-out, so callers treat null as "show the permission error, offer retry" —
 * not a silently-skipped extra. */
export function getCurrentLocation(): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 8000, maximumAge: 60_000 }
    );
  });
}
