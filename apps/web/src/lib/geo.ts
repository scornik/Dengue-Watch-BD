/** Great-circle distance in metres (haversine). */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_008.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Must match the 50 m check in the sites_before_update trigger. */
export const CLOSE_RADIUS_M = 50;

/** Opens the phone's maps app (Android geo: URI); OSM directions as fallback. */
export function navigationLinks(lat: number, lng: number) {
  const p = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  return {
    geo: `geo:${p}?q=${p}`,
    osm: `https://www.openstreetmap.org/directions?to=${encodeURIComponent(p)}#map=18/${lat.toFixed(5)}/${lng.toFixed(5)}`,
  };
}

export function getPosition(timeout = 20_000): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout, maximumAge: 0 }),
  );
}
