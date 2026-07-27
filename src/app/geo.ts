import tzlookup from 'tz-lookup';

export function timezoneFromCoords(lat: number, lng: number): string {
  return tzlookup(lat, lng);
}
