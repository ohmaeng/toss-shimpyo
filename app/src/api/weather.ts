import type { LatLng } from '../domain/geo';
import { PROXY_BASE, USE_MOCK } from './config';
import { fetchJson } from './http';
import type { WeatherResult } from './types';

interface ProxyWeatherBody {
  kind: 'ok' | 'stale';
  tempC: number | null;
  heatAlert: { level: '폭염주의보' | '폭염경보'; areaName: string } | null;
  cachedAt?: number;
}

function mockWeather(): WeatherResult {
  return { kind: 'ok', value: { tempC: 33.4, heatAlert: { level: '폭염경보', areaName: '서울시' } } };
}

/**
 * 기온 + 폭염특보.
 *
 * 특보 판정이 불가하면 heatAlert=null → 배너를 숨긴다.
 * 없는 특보를 띄우는 오탐이, 있는 특보를 놓치는 미탐보다 나쁘다 —
 * 오탐 한 번이면 사용자는 배너 전체를 무시하기 시작한다.
 */
export async function fetchWeather(coord: LatLng, signal?: AbortSignal): Promise<WeatherResult> {
  if (USE_MOCK) return mockWeather();

  const url = `${PROXY_BASE}/api/weather?lat=${coord.lat.toFixed(4)}&lng=${coord.lng.toFixed(4)}`;
  try {
    const b = await fetchJson<ProxyWeatherBody>(url, { timeoutMs: 6_000, ...(signal ? { signal } : {}) });
    const value = { tempC: b.tempC, heatAlert: b.heatAlert };
    if (b.kind === 'stale') return { kind: 'stale', value, cachedAt: b.cachedAt ?? Date.now() };
    return { kind: 'ok', value };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    return { kind: 'unavailable' };
  }
}
