import { useCallback, useEffect, useState } from 'react';
import { track } from '../platform/analytics';
import { storage } from '../platform/bridge';

const KEY = 'shimpyo.favorites.v1';

/**
 * 즐겨찾기 정류장 ID 집합.
 *
 * 등록률 20%+ 가 지표 목표다. 카드에서 원탭으로 등록되고, 앱 진입 시 바로 도착정보가 갱신된다.
 * 저장 실패가 앱을 죽이지 않는다 — 메모리 상태는 유지되고, 다음 실행에 없을 뿐이다.
 */
export function useFavorites() {
  const [ids, setIds] = useState<readonly string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const raw = await storage.getItem(KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed)) setIds(parsed.filter((x): x is string => typeof x === 'string'));
      } catch {
        /* 손상된 값은 무시하고 빈 목록으로 시작 */
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const persist = useCallback((next: readonly string[]) => {
    setIds(next);
    void storage.setItem(KEY, JSON.stringify(next));
  }, []);

  const toggle = useCallback(
    (stopId: string) => {
      const has = ids.includes(stopId);
      track(has ? 'favorite_remove' : 'favorite_add', { stop_id: stopId });
      persist(has ? ids.filter((i) => i !== stopId) : [...ids, stopId]);
    },
    [ids, persist],
  );

  const isFavorite = useCallback((stopId: string) => ids.includes(stopId), [ids]);

  return { ids, isFavorite, toggle, loaded };
}
