import { distanceMeters } from './geo';
import { shelterWalkMinState } from './shelter';
import type { ThreeState } from './threeState';
import { ALT_STOP_MAX_DISTANCE_M, walkMinutes } from './walking';
import { stopCoord, type Stop, type StopRoute } from './types';

/**
 * [불변 규칙] 대안 정류장 제안 — 4중 조건
 *
 * 4개 조건을 모두 만족할 때만 "인근의 더 시원한 정류장"을 제안한다.
 * 하나라도 미충족·미확인이면 제안하지 않는다.
 * 오제안이 신뢰를 깨는 것이 무제안보다 나쁘다.
 *
 *   1. 동일 노선이 정차하는 인접 정류장일 것
 *   2. 직선거리 300m 이내
 *   3. 시원함 우위가 데이터로 확인될 것 (v1 근거: 무더위쉼터 도보시간 단축 하나뿐)
 *   4. 도보 예상시간 ≤ 해당 노선 배차간격의 1/2
 *      — 배차간격을 확인할 수 없는 노선은 제안 비활성화
 *
 * 조건 4의 존재 이유: 대안 정류장으로 걸어가다 버스를 놓치면,
 * 다음 버스까지 뙤약볕에서 더 오래 기다린다. 시원한 곳을 찾아주려다 더 덥게 만드는 것이다.
 */

export type RejectReason =
  | 'same-stop'
  | 'no-shared-route' // 조건 1
  | 'too-far' // 조건 2
  | 'cooling-unknown' // 조건 3 — 어느 한쪽의 쉼터 데이터가 미확인
  | 'no-cooling-advantage' // 조건 3 — 확인됐으나 우위 없음
  | 'interval-unknown' // 조건 4 — 공유 노선의 배차간격 미확인
  | 'walk-exceeds-half-interval'; // 조건 4 — 걸어가면 버스를 놓친다

export interface AltStopSuggestion {
  readonly stop: Stop;
  /** 직선거리(m) */
  readonly distanceM: number;
  /** 분속 60m 환산 도보시간 */
  readonly walkMin: number;
  /** 조건 4를 만족시킨 공유 노선 (사용자에게 이 노선을 보여준다) */
  readonly viaRoute: StopRoute & { readonly intervalMin: number };
  /** 현재 정류장의 쉼터 도보시간 3상태 */
  readonly currentShelterWalk: ThreeState<number>;
  /** 대안 정류장의 쉼터 도보시간(분) — 조건 3을 통과했으므로 반드시 확인된 값 */
  readonly altShelterWalkMin: number;
}

export type AltStopDecision =
  | { readonly ok: true; readonly suggestion: AltStopSuggestion }
  | { readonly ok: false; readonly reason: RejectReason };

function sharedRoutes(a: Stop, b: Stop): StopRoute[] {
  const bIds = new Set(b.routes.map((r) => r.routeId));
  return a.routes.filter((r) => bIds.has(r.routeId));
}

/**
 * 조건 3: 시원함 우위가 데이터로 확인되는가.
 *
 * 양쪽 모두 확인된 상태여야 한다.
 * - 현재 present(c), 대안 present(k): k < c 이면 우위
 * - 현재 absent(반경 내 쉼터 없음-확인), 대안 present(k): 우위 (없던 쉼터가 생긴다)
 * - 어느 한쪽이라도 unknown: 판정 불가 → 제안 안 함
 * - 대안이 absent: 우위 없음
 */
function coolingAdvantage(
  current: ThreeState<number>,
  alt: ThreeState<number>,
): { ok: true; altWalkMin: number } | { ok: false; reason: 'cooling-unknown' | 'no-cooling-advantage' } {
  if (current.state === 'unknown' || alt.state === 'unknown') {
    return { ok: false, reason: 'cooling-unknown' };
  }
  if (alt.state === 'absent') return { ok: false, reason: 'no-cooling-advantage' };
  // 여기서 alt는 present
  if (current.state === 'absent') return { ok: true, altWalkMin: alt.value };
  return alt.value < current.value
    ? { ok: true, altWalkMin: alt.value }
    : { ok: false, reason: 'no-cooling-advantage' };
}

/** 단일 후보에 대한 4중 조건 판정. 탈락 사유를 남긴다. */
export function evaluateAltStop(current: Stop, candidate: Stop): AltStopDecision {
  if (current.id === candidate.id) return { ok: false, reason: 'same-stop' };

  // 조건 1
  const shared = sharedRoutes(current, candidate);
  if (shared.length === 0) return { ok: false, reason: 'no-shared-route' };

  // 조건 2
  const distanceM = distanceMeters(stopCoord(current), stopCoord(candidate));
  if (distanceM > ALT_STOP_MAX_DISTANCE_M) return { ok: false, reason: 'too-far' };

  // 조건 3
  const cooling = coolingAdvantage(shelterWalkMinState(current), shelterWalkMinState(candidate));
  if (!cooling.ok) return { ok: false, reason: cooling.reason };

  // 조건 4 — 배차간격이 확인된 공유 노선만 후보. 추정하지 않는다.
  const walkMin = walkMinutes(distanceM);
  const withInterval = shared.filter(
    (r): r is StopRoute & { intervalMin: number } => r.intervalMin !== null,
  );
  if (withInterval.length === 0) return { ok: false, reason: 'interval-unknown' };

  // 여러 노선이 있으면 가장 관대한(배차간격이 긴) 노선으로 판정한다.
  // 배차가 긴 노선일수록 걸어갈 여유가 크고, 그 노선을 타는 사람에게 제안은 안전하다.
  const viaRoute = withInterval.reduce((best, r) => (r.intervalMin > best.intervalMin ? r : best));
  if (walkMin * 2 > viaRoute.intervalMin) {
    return { ok: false, reason: 'walk-exceeds-half-interval' };
  }

  return {
    ok: true,
    suggestion: {
      stop: candidate,
      distanceM: Math.round(distanceM),
      walkMin,
      viaRoute,
      currentShelterWalk: shelterWalkMinState(current),
      altShelterWalkMin: cooling.altWalkMin,
    },
  };
}

/**
 * 후보군 전체에서 최선의 대안 하나를 고른다.
 * 최선 = 쉼터 도보시간이 가장 많이 줄어드는 것. 동률이면 덜 걷는 쪽.
 * 제안은 최대 1개다 — 두 개를 보여주면 사용자가 비교를 시작하고, 버스를 놓친다.
 */
export function findAltStop(current: Stop, candidates: readonly Stop[]): AltStopSuggestion | null {
  const passed: AltStopSuggestion[] = [];
  for (const c of candidates) {
    const d = evaluateAltStop(current, c);
    if (d.ok) passed.push(d.suggestion);
  }
  if (passed.length === 0) return null;

  const currentWalk = shelterWalkMinState(current);
  const gainOf = (s: AltStopSuggestion) =>
    currentWalk.state === 'present' ? currentWalk.value - s.altShelterWalkMin : Number.MAX_SAFE_INTEGER;

  return passed.reduce((best, s) => {
    const g = gainOf(s);
    const bg = gainOf(best);
    if (g !== bg) return g > bg ? s : best;
    return s.walkMin < best.walkMin ? s : best;
  });
}
