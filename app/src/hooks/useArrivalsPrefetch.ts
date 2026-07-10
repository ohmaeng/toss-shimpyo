import { useEffect } from 'react';
import { fetchArrivals } from '../api/arrivals';
import type { Stop } from '../domain/types';

/**
 * 즐겨찾기 정류장의 도착정보를 앱 진입 시 미리 한 번 호출한다.
 *
 * 프록시가 25초 캐싱하므로, 카드를 열 때 즉시 캐시 히트한다 → 3초 예산 안에 숫자가 뜬다.
 * 쿼터 비용은 즐겨찾기 개수만큼(보통 1~2건)이고, 앱 진입당 1회뿐이다.
 */
export function useArrivalsPrefetch(allStops: readonly Stop[], favoriteIds: readonly string[]) {
  useEffect(() => {
    if (favoriteIds.length === 0 || allStops.length === 0) return;
    const ctrl = new AbortController();
    const targets = allStops.filter((s) => favoriteIds.includes(s.id) && s.arrivalSupported).slice(0, 3);
    for (const s of targets) {
      void fetchArrivals(s, ctrl.signal).catch(() => {});
    }
    return () => ctrl.abort();
    // 즐겨찾기 목록이 바뀔 때만. 정류장 목록 변화로 재실행하지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favoriteIds.join(','), allStops.length > 0]);
}
