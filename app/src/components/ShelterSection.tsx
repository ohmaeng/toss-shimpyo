import { nearestShelter, shelterOpenState, sheltersState } from '../domain/shelter';
import { shelterTripAdvice } from '../domain/shelterTrip';
import { labelOf } from '../domain/threeState';
import type { Stop } from '../domain/types';
import { ThreeStateLabel } from './ThreeStateLabel';

/**
 * 여름 정보 — 가까운 무더위쉼터.
 *
 * [불변] 3상태 정직 표기:
 *   present → "걸어서 3분 · 역삼동 주민센터"
 *   absent  → "반경 300m 안에 쉼터 데이터가 없어요"   (찾아봤는데 없음)
 *   unknown → "주변 쉼터 정보를 확인하지 못했어요"     (못 찾아봄)
 *
 * 운영시간:
 *   closed  → 흐림 처리 + "지금은 운영시간이 아니에요"
 *   unknown → 흐림 없음 + "운영시간 미확인"   ← 흐리게 하면 "운영 안 함"으로 읽힌다
 *
 * "직선거리 기준" 병기는 장식이 아니다. 유모차·보행보조기 사용자에게 직선 300m는
 * 턱과 계단을 피해 500m일 수 있다. 그래서 이 문구는 caption이 아니라 본문 크기로 쓴다.
 */
export function ShelterSection({
  stop,
  dataDate,
  soonestArrivalSec,
}: {
  stop: Stop;
  dataDate: string;
  /** 가장 빨리 오는 버스까지 남은 초. 도착정보가 없으면 null → 왕복 조언을 하지 않는다. */
  soonestArrivalSec: number | null;
}) {
  const state = sheltersState(stop);

  if (state.state !== 'present') {
    const label = labelOf(state, {
      present: '',
      absent: '반경 300m 안에 쉼터 데이터가 없어요',
      unknown: '주변 쉼터 정보를 확인하지 못했어요',
    });
    return (
      <section className="shelter">
        <h3 className="shelter__heading">가까운 무더위쉼터</h3>
        <ThreeStateLabel label={label} />
      </section>
    );
  }

  const nearest = nearestShelter(stop);
  if (!nearest) return null; // present인데 nearest가 없을 수 없다 — 방어적

  const open = shelterOpenState(nearest.hours, new Date());
  const hoursLabel = labelOf(
    open === 'unknown' ? { state: 'unknown' } : { state: 'present', value: open },
    {
      present: open === 'open' ? '지금 운영 중' : '지금은 운영시간이 아니에요',
      absent: '',
      unknown: '운영시간 미확인',
    },
  );

  // 문 닫힌 쉼터로 다녀오라고 권하지 않는다. 운영시간 미확인도 마찬가지 —
  // 아기를 데리고 갔다가 잠겨 있으면 헛걸음이고, 그동안 폭염에 노출된다.
  const advice = open === 'open' ? shelterTripAdvice(soonestArrivalSec, nearest.walkMin) : { state: 'unknown' as const };

  return (
    <section className={`shelter ${open === 'closed' ? 'shelter--closed' : ''}`}>
      <h3 className="shelter__heading">가까운 무더위쉼터</h3>
      <p className="shelter__walk">
        <strong>걸어서 {nearest.walkMin}분</strong>
      </p>
      <p className="shelter__name">{nearest.name}</p>
      {/* 안전 경고는 caption 크기로 숨기지 않는다 */}
      <p className="shelter__basis">직선거리 {nearest.distanceM}m 기준이라, 실제로는 더 걸릴 수 있어요</p>

      <div className="shelter__meta">
        <ThreeStateLabel label={hoursLabel} />
        {nearest.hours ? (
          <span className="shelter__hours">
            {nearest.hours.open}–{nearest.hours.close}
          </span>
        ) : null}
      </div>

      {/* 사용자가 암산해야 했던 것을 앱이 한다: "버스 12분 남았는데 갔다 와도 되나?" */}
      {advice.state === 'present' ? (
        advice.value.kind === 'enough' ? (
          <p className="shelter__trip shelter__trip--go">
            버스가 {advice.value.busInMin}분 뒤에 와요. 왕복 약 {advice.value.roundTripMin}분이라 쉼터에 다녀올 여유가
            있어요.
          </p>
        ) : (
          <p className="shelter__trip shelter__trip--stay">
            버스가 {advice.value.busInMin}분 뒤에 와요. 여기서 기다리는 게 좋아요.
          </p>
        )
      ) : null}

      {dataDate ? <p className="shelter__datadate">쉼터 데이터 기준 {dataDate.replace('-', '.')}</p> : null}
    </section>
  );
}
