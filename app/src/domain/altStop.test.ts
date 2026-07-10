import { describe, expect, it } from 'vitest';
import { evaluateAltStop, findAltStop } from './altStop';
import type { Shelter, Stop, StopRoute } from './types';

const route = (id: string, intervalMin: number | null): StopRoute => ({
  routeId: id,
  name: id,
  intervalMin,
});

const shelter = (walkMin: number): Shelter => ({
  name: '무더위쉼터',
  lat: 37.5,
  lng: 127.0,
  distanceM: walkMin * 60,
  walkMin,
  hours: null,
});

/**
 * 기준 위도 37.5에서 동쪽으로 정확히 meters 만큼 떨어진 경도.
 * walkMinutes가 ceil이므로 헬퍼가 부정확하면 경계에서 1분씩 밀린다.
 */
const M_PER_DEG_LNG_AT_37_5 = 111_319.49 * Math.cos((37.5 * Math.PI) / 180);
const eastOf = (lng: number, meters: number) => lng + meters / M_PER_DEG_LNG_AT_37_5;

function stop(over: Partial<Stop> & Pick<Stop, 'id'>): Stop {
  return {
    name: over.id,
    lat: 37.5,
    lng: 127.0,
    nodeId: null,
    cityCode: null,
    arrivalSupported: true,
    routes: [route('146', 10)],
    shelters: [],
    shelterSearched: true,
    ...over,
  };
}

describe('4중 조건 — 각 조건이 단독으로 제안을 막는다', () => {
  const current = stop({ id: 'A', shelters: [shelter(8)] });

  it('조건 1: 공유 노선이 없으면 제안하지 않는다', () => {
    const cand = stop({ id: 'B', lng: eastOf(127.0, 100), routes: [route('999', 10)], shelters: [shelter(2)] });
    expect(evaluateAltStop(current, cand)).toEqual({ ok: false, reason: 'no-shared-route' });
  });

  it('조건 2: 직선거리 300m를 넘으면 제안하지 않는다', () => {
    const cand = stop({ id: 'B', lng: eastOf(127.0, 350), shelters: [shelter(1)], routes: [route('146', 60)] });
    expect(evaluateAltStop(current, cand)).toEqual({ ok: false, reason: 'too-far' });
  });

  it('조건 3: 대안의 쉼터 데이터가 미확인이면 제안하지 않는다 (unknown ≠ absent)', () => {
    const cand = stop({ id: 'B', lng: eastOf(127.0, 100), shelterSearched: false, shelters: [] });
    expect(evaluateAltStop(current, cand)).toEqual({ ok: false, reason: 'cooling-unknown' });
  });

  it('조건 3: 현재 정류장의 쉼터 데이터가 미확인이면 제안하지 않는다', () => {
    const cur = stop({ id: 'A', shelterSearched: false });
    const cand = stop({ id: 'B', lng: eastOf(127.0, 100), shelters: [shelter(2)] });
    expect(evaluateAltStop(cur, cand)).toEqual({ ok: false, reason: 'cooling-unknown' });
  });

  it('조건 3: 시원함 우위가 없으면 제안하지 않는다 (더 멀거나 같으면)', () => {
    const cand = stop({ id: 'B', lng: eastOf(127.0, 100), shelters: [shelter(8)] });
    expect(evaluateAltStop(current, cand)).toEqual({ ok: false, reason: 'no-cooling-advantage' });
  });

  it('조건 3: 대안에 쉼터가 없음(확인)이면 우위가 아니다', () => {
    const cand = stop({ id: 'B', lng: eastOf(127.0, 100), shelters: [], shelterSearched: true });
    expect(evaluateAltStop(current, cand)).toEqual({ ok: false, reason: 'no-cooling-advantage' });
  });

  it('조건 4: 공유 노선의 배차간격이 미확인이면 제안하지 않는다 (추정 금지)', () => {
    const cur = stop({ id: 'A', shelters: [shelter(8)], routes: [route('146', null)] });
    const cand = stop({ id: 'B', lng: eastOf(127.0, 60), shelters: [shelter(2)], routes: [route('146', null)] });
    expect(evaluateAltStop(cur, cand)).toEqual({ ok: false, reason: 'interval-unknown' });
  });

  it('조건 4: 도보시간이 배차간격의 1/2을 넘으면 제안하지 않는다 (버스를 놓친다)', () => {
    // 200m → 분속 60m → 4분(올림). 배차 6분의 1/2 = 3분 < 4분 → 탈락
    const cur = stop({ id: 'A', shelters: [shelter(8)], routes: [route('146', 6)] });
    const cand = stop({ id: 'B', lng: eastOf(127.0, 200), shelters: [shelter(1)], routes: [route('146', 6)] });
    expect(evaluateAltStop(cur, cand)).toEqual({ ok: false, reason: 'walk-exceeds-half-interval' });
  });

  it('조건 4 경계: 도보시간이 정확히 배차간격의 1/2이면 통과한다', () => {
    // 110m → 2분(올림). 배차 4분의 1/2 = 2분 → 통과
    const cur = stop({ id: 'A', shelters: [shelter(8)], routes: [route('146', 4)] });
    const cand = stop({ id: 'B', lng: eastOf(127.0, 110), shelters: [shelter(1)], routes: [route('146', 4)] });
    const d = evaluateAltStop(cur, cand);
    expect(d.ok).toBe(true);
  });
});

describe('4중 조건 모두 만족', () => {
  it('제안을 반환하고, 통과시킨 노선과 도보시간을 함께 준다', () => {
    const cur = stop({ id: 'A', shelters: [shelter(8)], routes: [route('146', 20)] });
    const cand = stop({ id: 'B', lng: eastOf(127.0, 170), shelters: [shelter(3)], routes: [route('146', 20)] });
    const d = evaluateAltStop(cur, cand);
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.suggestion.stop.id).toBe('B');
    expect(d.suggestion.walkMin).toBe(3); // 170m / 60 = 2.83 → 올림 3분
    expect(d.suggestion.viaRoute.name).toBe('146');
    expect(d.suggestion.viaRoute.intervalMin).toBe(20);
    expect(d.suggestion.altShelterWalkMin).toBe(3);
  });

  it('현재 쉼터가 없음(확인)이고 대안에 쉼터가 있으면 우위로 인정한다', () => {
    const cur = stop({ id: 'A', shelters: [], shelterSearched: true, routes: [route('146', 20)] });
    const cand = stop({ id: 'B', lng: eastOf(127.0, 100), shelters: [shelter(2)], routes: [route('146', 20)] });
    expect(evaluateAltStop(cur, cand).ok).toBe(true);
  });

  it('자기 자신은 제안하지 않는다', () => {
    const cur = stop({ id: 'A', shelters: [shelter(8)] });
    expect(evaluateAltStop(cur, cur)).toEqual({ ok: false, reason: 'same-stop' });
  });
});

describe('findAltStop — 최선 하나만 고른다', () => {
  const cur = stop({ id: 'A', shelters: [shelter(9)], routes: [route('146', 30)] });

  it('쉼터 도보시간이 가장 많이 줄어드는 후보를 고른다', () => {
    const near = stop({ id: 'near', lng: eastOf(127.0, 60), shelters: [shelter(6)], routes: [route('146', 30)] });
    const best = stop({ id: 'best', lng: eastOf(127.0, 240), shelters: [shelter(1)], routes: [route('146', 30)] });
    expect(findAltStop(cur, [near, best])?.stop.id).toBe('best');
  });

  it('이득이 같으면 덜 걷는 쪽을 고른다', () => {
    const far = stop({ id: 'far', lng: eastOf(127.0, 240), shelters: [shelter(4)], routes: [route('146', 30)] });
    const close = stop({ id: 'close', lng: eastOf(127.0, 60), shelters: [shelter(4)], routes: [route('146', 30)] });
    expect(findAltStop(cur, [far, close])?.stop.id).toBe('close');
  });

  it('통과하는 후보가 없으면 null — 억지로 제안하지 않는다', () => {
    const bad = stop({ id: 'bad', lng: eastOf(127.0, 100), shelters: [shelter(20)], routes: [route('146', 30)] });
    expect(findAltStop(cur, [bad])).toBeNull();
  });

  it('빈 후보군이면 null', () => {
    expect(findAltStop(cur, [])).toBeNull();
  });
});
