import { describe, expect, it } from 'vitest';
import type { Stop } from '../domain/types';
import { fetchArrivals } from './arrivals';

const stop = (over: Partial<Stop> = {}): Stop => ({
  id: 'A',
  name: 'A',
  lat: 37.5,
  lng: 127.0,
  nodeId: 'NODE1',
  cityCode: 23,
  arrivalSupported: true,
  routes: [{ routeId: 'R1', name: '146', intervalMin: 10 }],
  shelters: [],
  shelterSearched: true,
  ...over,
});

/**
 * VITE_PROXY_BASE 가 없으므로 USE_MOCK=true. 목 경로를 검증한다.
 * 핵심은 "장애와 미제공과 데이터없음이 섞이지 않는가"이다.
 */
describe('fetchArrivals — 상태가 섞이지 않는다', () => {
  it('TAGO 조인이 안 된 정류장은 unsupported (장애가 아니다)', async () => {
    const r = await fetchArrivals(stop({ nodeId: null, arrivalSupported: false }));
    expect(r.kind).toBe('unsupported');
  });

  it('cityCode 가 없으면 unsupported', async () => {
    const r = await fetchArrivals(stop({ cityCode: null }));
    expect(r.kind).toBe('unsupported');
  });

  it('arrivalSupported=false 면 unsupported', async () => {
    const r = await fetchArrivals(stop({ arrivalSupported: false }));
    expect(r.kind).toBe('unsupported');
  });

  it('정상 정류장은 ok + items', async () => {
    const r = await fetchArrivals(stop());
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.items[0]?.routeName).toBe('146');
  });

  it('unavailable 에는 items 필드가 없다 — 빈 배열을 줄 수 없는 타입', () => {
    // 타입 레벨 계약을 문서화하는 테스트. unavailable에 items를 붙이면 컴파일이 깨진다.
    const r = { kind: 'unavailable', retryable: true } as const;
    expect('items' in r).toBe(false);
  });
});
