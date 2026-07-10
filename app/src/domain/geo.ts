export interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

export type BBox = readonly [minLng: number, minLat: number, maxLng: number, maxLat: number];

const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** 두 좌표 사이의 직선(대권) 거리(m). 이 앱의 모든 거리는 직선거리다 — UI에 반드시 병기한다. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function inBBox(p: LatLng, box: BBox): boolean {
  const [minLng, minLat, maxLng, maxLat] = box;
  return p.lng >= minLng && p.lng <= maxLng && p.lat >= minLat && p.lat <= maxLat;
}

/** bbox 경계로부터의 대략적 거리(m). 경계 근처 판정(인접 시군구 추가 로드)에 쓴다. */
export function distanceToBBoxMeters(p: LatLng, box: BBox): number {
  const [minLng, minLat, maxLng, maxLat] = box;
  if (inBBox(p, box)) return 0;
  const clampedLat = Math.min(Math.max(p.lat, minLat), maxLat);
  const clampedLng = Math.min(Math.max(p.lng, minLng), maxLng);
  return distanceMeters(p, { lat: clampedLat, lng: clampedLng });
}

/** 대한민국 경위도 범위. 파이프라인과 클라이언트 양쪽에서 이상치를 거른다. */
export function isPlausibleKoreaCoord(p: LatLng): boolean {
  return p.lat >= 33 && p.lat <= 39 && p.lng >= 124 && p.lng <= 132;
}
