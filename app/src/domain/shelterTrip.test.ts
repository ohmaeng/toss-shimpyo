import { describe, expect, it } from 'vitest';
import { shelterTripAdvice, soonestArrivalSec } from './shelterTrip';

const min = (m: number) => m * 60;

describe('shelterTripAdvice — "갔다 와도 되나"에 앱이 답한다', () => {
  it('버스 12분, 쉼터 편도 3분 → 왕복 6분 + 여유 3분 = 9분 ≤ 12분 → 여유 있음', () => {
    const r = shelterTripAdvice(min(12), 3);
    expect(r).toEqual({ state: 'present', value: { kind: 'enough', roundTripMin: 6, busInMin: 12 } });
  });

  it('버스 5분, 쉼터 편도 3분 → 왕복 6분 > 5분 → 여기서 기다린다', () => {
    const r = shelterTripAdvice(min(5), 3);
    expect(r).toEqual({ state: 'present', value: { kind: 'stay', busInMin: 5 } });
  });

  it('경계: 버스 9분, 편도 3분 (왕복 6 + 여유 3 = 9) → 정확히 여유 있음', () => {
    const r = shelterTripAdvice(min(9), 3);
    if (r.state !== 'present') throw new Error('present여야 한다');
    expect(r.value.kind).toBe('enough');
  });

  it('경계 바로 아래: 버스 8분, 편도 3분 → 기다린다 (애매하면 stay)', () => {
    const r = shelterTripAdvice(min(8), 3);
    if (r.state !== 'present') throw new Error('present여야 한다');
    expect(r.value.kind).toBe('stay');
  });

  it('버스 도착 시간을 내림한다 — 11분 59초를 12분이라고 낙관하지 않는다', () => {
    const r = shelterTripAdvice(min(8) + 59, 3); // 8.98분 → 8분
    if (r.state !== 'present') throw new Error('present여야 한다');
    expect(r.value.kind).toBe('stay');
    expect(r.value.busInMin).toBe(8);
  });

  it('도착정보를 모르면 unknown — 조언하지 않는다', () => {
    expect(shelterTripAdvice(null, 3).state).toBe('unknown');
  });

  it('음수·NaN 같은 이상치는 unknown — 추측하지 않는다', () => {
    expect(shelterTripAdvice(-1, 3).state).toBe('unknown');
    expect(shelterTripAdvice(Number.NaN, 3).state).toBe('unknown');
  });

  it('먼 쉼터는 버스가 아무리 늦어도 결국 stay가 될 수 있다', () => {
    // 편도 10분 → 왕복 20 + 여유 3 = 23분 필요. 버스 20분이면 부족.
    const r = shelterTripAdvice(min(20), 10);
    if (r.state !== 'present') throw new Error('present여야 한다');
    expect(r.value.kind).toBe('stay');
  });
});

describe('soonestArrivalSec', () => {
  it('가장 빠른 버스를 고른다', () => {
    expect(soonestArrivalSec([{ arrivalSec: 600 }, { arrivalSec: 120 }, { arrivalSec: 300 }])).toBe(120);
  });

  it('도착 예정 버스가 없으면 null — 0이 아니다', () => {
    expect(soonestArrivalSec([])).toBeNull();
  });
});
