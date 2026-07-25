import tzlookup from 'tz-lookup';

/** Map GPS coordinates to an IANA timezone (offline). */
export function timezoneFromCoords(lat: number, lng: number): string {
  return tzlookup(lat, lng);
}
