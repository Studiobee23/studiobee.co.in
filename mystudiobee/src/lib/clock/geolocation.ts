/** Resolves once with the device's current coordinates, or null on denial/timeout/
 * unsupported browser. Location is now a required (blocking) part of both clock-in
 * and clock-out, so callers treat null as "show the permission error, offer retry" —
 * not a silently-skipped extra.
 *
 * The `timeout` clock starts the instant getCurrentPosition() is called — on a
 * first-time request that includes however long the browser's permission prompt
 * sits waiting for the user to click Allow. A short timeout here reads as "denied"
 * even when the user allowed it, just slightly slowly, so this is set generously
 * rather than tuned for the post-permission (fast) case. */
export function getCurrentLocation(): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 30_000, maximumAge: 60_000 }
    );
  });
}
