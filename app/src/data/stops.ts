import { DATA_BASE } from '../api/config';
import { fetchJsonWithRetry } from '../api/http';
import { distanceMeters, type LatLng } from '../domain/geo';
import type { SggData, Stop } from '../domain/types';
import { findSggCandidates } from './sggIndex';

/** 로드 실패는 빈 목록이 아니라 에러다. 빈 지도를 정상인 척 보여주지 않는다. */
export class StopsLoadError extends Error {
  constructor(cause?: unknown) {
    super('정류장 데이터를 불러오지 못했습니다', { cause });
    this.name = 'StopsLoadError';
  }
}

const cache = new Map<string, SggData>();

async function loadSgg(code: string, signal?: AbortSignal): Promise<SggData> {
  const hit = cache.get(code);
  if (hit) return hit;
  // 재시도 1회. 계획서 §5.7 "시군구 JSON 로드 실패 → 재시도 1회".
  const data = await fetchJsonWithRetry<SggData>(`${DATA_BASE}/stops/${code}.json`, 1, {
    timeoutMs: 8_000,
    ...(signal ? { signal } : {}),
  });
  cache.set(code, data);
  return data;
}

export interface NearbyResult {
  readonly stops: readonly Stop[];
  /** 로드된 시군구들의 데이터 기준일 중 가장 오래된 것. 카드에 표기한다. */
  readonly dataDate: string;
  readonly sggNames: readonly string[];
}

export interface StopWithDistance {
  readonly stop: Stop;
  readonly distanceM: number;
}

/**
 * 현재 좌표 주변의 정류장.
 *
 * bounding-box 인덱스 → 시군구 1~2개 → 해당 JSON만 fetch.
 * 전국 데이터를 통째로 받는 경로는 존재하지 않는다.
 */
export async function loadNearbyStops(coord: LatLng, signal?: AbortSignal): Promise<NearbyResult> {
  const candidates = findSggCandidates(coord);
  if (candidates.length === 0) {
    // 대한민국 밖이거나 데이터가 없는 지역. 에러가 아니라 빈 결과다 — 확인된 사실.
    return { stops: [], dataDate: '', sggNames: [] };
  }

  const settled = await Promise.allSettled(candidates.map((c) => loadSgg(c.code, signal)));
  const loaded = settled.filter((s): s is PromiseFulfilledResult<SggData> => s.status === 'fulfilled');

  // 하나도 못 받으면 에러. 일부만 받았으면 받은 것으로 진행한다(경계 지역에서 옆 동네가 없어도 동작).
  if (loaded.length === 0) throw new StopsLoadError(settled[0]?.status === 'rejected' ? settled[0].reason : undefined);

  const seen = new Set<string>();
  const stops: Stop[] = [];
  for (const { value } of loaded) {
    for (const s of value.stops) {
      if (seen.has(s.id)) continue; // 경계에서 중복될 수 있다
      seen.add(s.id);
      stops.push(s);
    }
  }

  const dataDate = loaded.map((l) => l.value.dataDate).sort()[0] ?? '';
  return { stops, dataDate, sggNames: loaded.map((l) => l.value.sggName) };
}

export function nearestStops(
  coord: LatLng,
  stops: readonly Stop[],
  limit: number,
): readonly StopWithDistance[] {
  return stops
    .map((stop) => ({ stop, distanceM: Math.round(distanceMeters(coord, { lat: stop.lat, lng: stop.lng })) }))
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, limit);
}

/** 검색 폴백용. 정류장명 부분일치. */
export function searchStops(query: string, stops: readonly Stop[], limit = 20): readonly Stop[] {
  const q = query.trim();
  if (q.length === 0) return [];
  return stops.filter((s) => s.name.includes(q)).slice(0, limit);
}

/** 대안 정류장 후보군: 같은 시군구 내 300m 반경. 4중 조건은 findAltStop이 판정한다. */
export function altStopCandidates(current: Stop, all: readonly Stop[]): readonly Stop[] {
  const c = { lat: current.lat, lng: current.lng };
  return all.filter(
    (s) => s.id !== current.id && distanceMeters(c, { lat: s.lat, lng: s.lng }) <= 300,
  );
}
