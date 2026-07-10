/**
 * 도보 시간 환산.
 *
 * [불변] 분속 60m — 고령자 보수 기준.
 * persona-elderly(71세)와 persona-caregiver(유모차)가 이 앱의 폭염 취약 사용자다.
 * 건강한 성인 기준(분속 80m)으로 계산하면 이들에게 "4분"이라고 말하고 6분을 걷게 만든다.
 *
 * 이 값은 직선거리 기준이므로, 실제 도보 경로는 더 길다.
 * 따라서 UI는 항상 "직선거리 기준"을 병기해야 한다 — 함수가 강제할 수 없으므로 컴포넌트의 책임이다.
 */
export const WALK_SPEED_M_PER_MIN = 60;

/** 대안 정류장 제안의 최대 직선거리(m). [불변] 4중 조건 #2. */
export const ALT_STOP_MAX_DISTANCE_M = 300;

/** 쉼터 근접 결합 반경(m). 파이프라인과 동일해야 한다. */
export const SHELTER_SEARCH_RADIUS_M = 300;

/** 올림한다 — 3.1분을 "3분"이라 말해 버스를 놓치게 하지 않는다. */
export function walkMinutes(distanceMeters: number): number {
  return Math.max(1, Math.ceil(distanceMeters / WALK_SPEED_M_PER_MIN));
}
