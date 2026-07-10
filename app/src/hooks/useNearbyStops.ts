import { useCallback, useEffect, useState } from 'react';
import type { LatLng } from '../domain/geo';
import { loadNearbyStops, StopsLoadError, type NearbyResult } from '../data/stops';

export type StopsState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ok'; readonly data: NearbyResult }
  /** 로드 실패. 빈 지도를 정상인 척 보여주지 않는다. */
  | { readonly kind: 'error' };

export function useNearbyStops(coord: LatLng | null) {
  const [state, setState] = useState<StopsState>({ kind: 'loading' });

  const load = useCallback(async () => {
    if (!coord) return;
    setState({ kind: 'loading' });
    try {
      const data = await loadNearbyStops(coord);
      setState({ kind: 'ok', data });
    } catch (e) {
      if (e instanceof StopsLoadError || e instanceof Error) setState({ kind: 'error' });
    }
  }, [coord]);

  useEffect(() => {
    if (!coord) return;
    void load();
  }, [coord, load]);

  return { state, retry: load };
}
