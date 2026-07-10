import { useEffect, useState } from 'react';
import { fetchWeather } from '../api/weather';
import type { WeatherResult } from '../api/types';
import type { LatLng } from '../domain/geo';

/** 기온·폭염특보. 10분마다 갱신 — 특보는 그보다 자주 바뀌지 않는다. */
const WEATHER_POLL_MS = 10 * 60_000;

export function useWeather(coord: LatLng | null) {
  const [result, setResult] = useState<WeatherResult | null>(null);

  useEffect(() => {
    if (!coord) return;
    const ctrl = new AbortController();

    const load = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const r = await fetchWeather(coord, ctrl.signal);
        if (!ctrl.signal.aborted) setResult(r);
      } catch {
        /* abort — 무시 */
      }
    };
    void load();
    const timer = window.setInterval(load, WEATHER_POLL_MS);

    return () => {
      ctrl.abort();
      window.clearInterval(timer);
    };
    // 좌표가 크게 안 바뀌면 재요청하지 않도록 소수 3자리로 고정
  }, [coord?.lat.toFixed(3), coord?.lng.toFixed(3)]); // eslint-disable-line react-hooks/exhaustive-deps

  return result;
}
