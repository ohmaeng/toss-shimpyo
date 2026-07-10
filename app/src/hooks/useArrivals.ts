import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchArrivals } from '../api/arrivals';
import { ARRIVALS_POLL_MS } from '../api/config';
import type { ArrivalsResult } from '../api/types';
import type { Stop } from '../domain/types';
import { track } from '../platform/analytics';

/**
 * 실시간 도착정보 폴링.
 *
 * [쿼터] 백그라운드/비활성 탭에서는 폴링을 멈춘다.
 * 개발계정 일 1,000건 한도에서, 화면 밖 폴링은 순수한 낭비이고 배터리도 먹는다.
 */
export function useArrivals(stop: Stop | null) {
  const [result, setResult] = useState<ArrivalsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!stop) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    try {
      const r = await fetchArrivals(stop, ctrl.signal);
      if (ctrl.signal.aborted) return;
      setResult(r);
      if (r.kind === 'unavailable') track('arrivals_unavailable', { stop_id: stop.id });
    } catch {
      if (!ctrl.signal.aborted) setResult({ kind: 'unavailable', retryable: true });
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, [stop]);

  useEffect(() => {
    setResult(null);
    if (!stop) return;
    void load();

    let timer: number | undefined;
    const tick = () => {
      // 화면이 가려져 있으면 호출하지 않는다.
      if (document.visibilityState === 'visible') void load();
    };
    const start = () => {
      window.clearInterval(timer);
      timer = window.setInterval(tick, ARRIVALS_POLL_MS);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void load(); // 돌아오면 즉시 갱신 — 오래된 숫자를 보여주지 않는다
        start();
      } else {
        window.clearInterval(timer);
      }
    };

    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      abortRef.current?.abort();
    };
  }, [stop, load]);

  return { result, loading, retry: load };
}
