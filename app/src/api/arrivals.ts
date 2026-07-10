import type { Stop } from '../domain/types';
import { PROXY_BASE, USE_MOCK } from './config';
import { fetchJsonWithAge, HttpError } from './http';
import type { ArrivalsResult } from './types';

/**
 * 이 나이를 넘은 응답은 실시간이라고 부르지 않는다.
 *
 * 프록시 CDN TTL이 25초이므로 정상 응답의 나이는 25초 이하다.
 * 그보다 훨씬 오래됐다면 CDN이 stale-while-revalidate로 서빙 중이라는 뜻 —
 * 즉 원 API가 죽어 있다. 그때는 "○분 전 정보"로 정직하게 표기한다.
 */
const MAX_FRESH_AGE_SEC = 45;

interface ProxyArrivalsBody {
  kind: 'ok' | 'stale' | 'unsupported';
  items?: { routeName: string; arrivalSec: number; prevStopCount: number | null }[];
  cachedAt?: number;
}

/** 목 모드: 프록시/키가 없는 개발 환경. 화면에 목 배지가 뜬다. */
function mockArrivals(stop: Stop): ArrivalsResult {
  if (!stop.arrivalSupported) return { kind: 'unsupported' };
  const seed = stop.id.length;
  return {
    kind: 'ok',
    items: stop.routes.slice(0, 3).map((r, i) => ({
      routeName: r.name,
      arrivalSec: (i * 4 + seed) * 47 + 60,
      prevStopCount: i + 1,
    })),
  };
}

/**
 * 실시간 도착정보.
 *
 * 재시도하지 않는다 — 도착정보는 신선도가 전부이고, 재시도로 얻은 3초 늦은 응답은
 * 사용자를 더 오래 기다리게 만들 뿐이다. 실패하면 즉시 unavailable을 반환하고
 * UI가 재시도 버튼을 준다(사용자가 결정한다).
 */
export async function fetchArrivals(stop: Stop, signal?: AbortSignal): Promise<ArrivalsResult> {
  // TAGO 조인이 깨진 정류장. 장애가 아니라 미제공이다 — 둘을 섞지 않는다.
  if (!stop.arrivalSupported || stop.nodeId === null || stop.cityCode === null) {
    return { kind: 'unsupported' };
  }
  if (USE_MOCK) return mockArrivals(stop);

  const url = `${PROXY_BASE}/api/arrivals?cityCode=${stop.cityCode}&nodeId=${encodeURIComponent(stop.nodeId)}`;
  try {
    const { body, ageSec } = await fetchJsonWithAge<ProxyArrivalsBody>(url, {
      timeoutMs: 6_000,
      ...(signal ? { signal } : {}),
    });
    if (body.kind === 'unsupported') return { kind: 'unsupported' };
    const items = (body.items ?? []).map((i) => ({
      routeName: i.routeName,
      arrivalSec: i.arrivalSec,
      prevStopCount: i.prevStopCount,
    }));

    // 프록시가 스스로 stale이라고 말했거나(인메모리 캐시 폴백),
    // CDN이 오래된 응답을 서빙 중이거나(Age 헤더) — 둘 다 "○분 전 정보"다.
    if (body.kind === 'stale') {
      return { kind: 'stale', items, cachedAt: body.cachedAt ?? Date.now() - ageSec * 1000 };
    }
    if (ageSec > MAX_FRESH_AGE_SEC) {
      return { kind: 'stale', items, cachedAt: Date.now() - ageSec * 1000 };
    }
    return { kind: 'ok', items };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    // 프록시가 404를 주면 미제공, 그 외 전부 장애.
    if (e instanceof HttpError && e.status === 404) return { kind: 'unsupported' };
    return { kind: 'unavailable', retryable: true };
  }
}
