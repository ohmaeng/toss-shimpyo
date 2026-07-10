import { unknown, type ThreeState } from './threeState';

/**
 * "쉼터에 다녀올 여유가 있는가?"
 *
 * persona-caregiver(유모차·아기, 34도)가 앱에 요구한 단 하나의 계산이다:
 * "버스 12분 남았고 쉼터는 3분 거리 — 갔다 와도 버스를 잡을 수 있나?"
 * 앱은 이 두 숫자를 이미 갖고 있으면서 사용자에게 암산을 시키고 있었다.
 *
 * 대안 정류장 4중 조건 #4와 정확히 같은 종류의 계산이다.
 * 다르게 답할 이유가 없으므로, 같은 보수성으로 답한다.
 *
 * persona-elderly(느린 걸음, 폭염 취약) 보호:
 *  - 왕복 도보시간에 여유분(BUFFER_MIN)을 더해서 판정한다.
 *  - "다녀오세요"라고 지시하지 않는다. "여유가 있어요"라고 사실만 말한다.
 *  - 애매하면 'stay'다. 여기서 기다리라는 조언은 절대 사람을 위험에 빠뜨리지 않는다.
 */

/** 쉼터에서 나오는 시간, 신호등, 아기를 유모차에 다시 태우는 시간. */
export const BUFFER_MIN = 3;

export type ShelterTripAdvice =
  /** 왕복 + 여유분이 다음 버스 도착 안에 들어온다 */
  | { readonly kind: 'enough'; readonly roundTripMin: number; readonly busInMin: number }
  /** 버스가 곧 온다. 여기서 기다리는 것이 안전하다. */
  | { readonly kind: 'stay'; readonly busInMin: number };

/**
 * @param soonestArrivalSec 가장 빨리 오는 버스까지 남은 초. 도착정보가 없으면 null.
 * @param shelterWalkMin 쉼터까지 편도 도보(분). 분속 60m 기준.
 *
 * 도착정보를 모르면 unknown — 조언하지 않는다. 3상태 원칙은 여기에도 적용된다.
 */
export function shelterTripAdvice(
  soonestArrivalSec: number | null,
  shelterWalkMin: number,
): ThreeState<ShelterTripAdvice> {
  if (soonestArrivalSec === null || !Number.isFinite(soonestArrivalSec) || soonestArrivalSec < 0) {
    return unknown();
  }

  // 내림한다 — 버스가 실제로 오는 시각을 낙관하지 않는다.
  const busInMin = Math.floor(soonestArrivalSec / 60);
  const roundTripMin = shelterWalkMin * 2;

  if (busInMin >= roundTripMin + BUFFER_MIN) {
    return { state: 'present', value: { kind: 'enough', roundTripMin, busInMin } };
  }
  return { state: 'present', value: { kind: 'stay', busInMin } };
}

/** 도착정보 목록에서 가장 빠른 버스까지 남은 초. 없으면 null. */
export function soonestArrivalSec(items: readonly { arrivalSec: number }[]): number | null {
  if (items.length === 0) return null;
  return items.reduce((min, i) => (i.arrivalSec < min ? i.arrivalSec : min), Number.POSITIVE_INFINITY);
}
