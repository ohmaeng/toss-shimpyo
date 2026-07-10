import { fromSearch, present, unknown, type ThreeState } from './threeState';
import type { OperatingHours, Shelter, Stop } from './types';

/**
 * 쉼터 운영 상태.
 * - open/closed: 운영시간 데이터가 있고 현재 시각으로 판정 가능
 * - unknown: 운영시간 필드가 없음 → "운영시간 미확인", 흐림 처리 없음
 *
 * [불변] 흐림 처리는 `closed`에만. `unknown`을 흐리게 만들면 "운영 안 함"으로 읽힌다.
 */
export type ShelterOpenState = 'open' | 'closed' | 'unknown';

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return null;
  return h * 60 + min;
}

export function shelterOpenState(hours: OperatingHours | null, now: Date): ShelterOpenState {
  if (hours === null) return 'unknown';
  const open = toMinutes(hours.open);
  const close = toMinutes(hours.close);
  if (open === null || close === null) return 'unknown';

  const cur = now.getHours() * 60 + now.getMinutes();
  // 자정을 넘기는 운영시간(예: 22:00-06:00) 지원
  if (close <= open) return cur >= open || cur < close ? 'open' : 'closed';
  return cur >= open && cur < close ? 'open' : 'closed';
}

/** 반경 내 쉼터 목록의 3상태. 빈 배열이 "없음(확인)"이 되려면 검색이 수행됐어야 한다. */
export function sheltersState(stop: Stop): ThreeState<readonly Shelter[]> {
  return fromSearch(stop.shelterSearched, stop.shelters);
}

/** 가장 가까운 쉼터. 여러 개면 도보시간이 가장 짧은 것. */
export function nearestShelter(stop: Stop): Shelter | null {
  if (!stop.shelterSearched || stop.shelters.length === 0) return null;
  return stop.shelters.reduce((best, s) => (s.walkMin < best.walkMin ? s : best));
}

/**
 * 이 정류장에서 가장 가까운 쉼터까지의 도보시간(분)에 대한 3상태.
 *
 * 대안 정류장 4중 조건 #3(시원함 우위)의 유일한 판단 근거다.
 * - present(n): 반경 내 쉼터가 있고 n분 걸린다
 * - absent:     반경 내 쉼터가 없음이 확인됨 (검색 수행됨)
 * - unknown:    검색을 수행하지 못함 → 판정 배제
 */
export function shelterWalkMinState(stop: Stop): ThreeState<number> {
  if (!stop.shelterSearched) return unknown();
  const nearest = nearestShelter(stop);
  if (nearest === null) return { state: 'absent' };
  return present(nearest.walkMin);
}
