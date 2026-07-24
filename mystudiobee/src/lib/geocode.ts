/** Server-only reverse geocoding via OpenStreetMap Nominatim (free, no API key —
 * fine at this app's volume). Never throws: returns null on any failure/timeout
 * so callers can fall back to raw coordinates rather than blocking a clock punch
 * on a third-party service being slow or down. */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18`;
    const res = await fetch(url, {
      headers: { "User-Agent": "mystudiobee/1.0 (internal ops tool, StudioBee)" },
      signal: controller.signal,
    });
    if (!res.ok) return null;

    const data = (await res.json()) as { display_name?: string };
    return data.display_name ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
