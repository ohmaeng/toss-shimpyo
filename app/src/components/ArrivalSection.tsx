import type { Arrival, ArrivalsResult } from '../api/types';
import { ErrorState } from './ErrorState';
import { StaleDataLabel } from './StaleDataLabel';

function formatArrival(sec: number): string {
  if (sec < 60) return '곧 도착';
  const m = Math.floor(sec / 60);
  return `${m}분 후`;
}

function ArrivalRow({ arrival }: { arrival: Arrival }) {
  return (
    <li className="arrival-row">
      <span className="arrival-row__route">{arrival.routeName}</span>
      <span className="arrival-row__time">{formatArrival(arrival.arrivalSec)}</span>
      {arrival.prevStopCount !== null ? (
        <span className="arrival-row__stops">{arrival.prevStopCount}정거장 전</span>
      ) : null}
    </li>
  );
}

/**
 * 실시간 도착정보 섹션.
 *
 * 카드에서 가장 큰 타이포를 차지한다 — 사용자가 앱을 여는 이유는 "버스 언제 와"이기 때문이다.
 * 여름 정보가 이걸 밀어내면 앱의 존재 이유가 뒤집힌다.
 *
 * [불변] 네 가지 상태를 절대 섞지 않는다:
 *   ok + 빈 배열  → "지금 도착 예정인 버스가 없어요" (확인된 사실)
 *   unavailable   → "일시적으로 불러올 수 없어요" + 재시도  (장애)
 *   unsupported   → "이 지역은 실시간 도착정보가 제공되지 않아요"  (미제공)
 *   stale         → 캐시 데이터 + "○분 전 정보"
 */
export function ArrivalSection({
  result,
  loading,
  onRetry,
  routeNames,
}: {
  result: ArrivalsResult | null;
  loading: boolean;
  onRetry: () => void;
  routeNames: readonly string[];
}) {
  if (result === null && loading) {
    return (
      <div className="arrivals">
        <div className="skeleton skeleton--row" />
        <div className="skeleton skeleton--row" />
      </div>
    );
  }
  if (result === null) return null;

  if (result.kind === 'unsupported') {
    return (
      <div className="arrivals arrivals--unsupported">
        <p className="arrivals__notice">이 지역은 실시간 도착정보가 제공되지 않아요</p>
        {routeNames.length > 0 ? (
          <p className="arrivals__routes">경유 노선 {routeNames.join(', ')}</p>
        ) : null}
      </div>
    );
  }

  if (result.kind === 'unavailable') {
    return (
      <div className="arrivals">
        <ErrorState title="도착정보를 일시적으로 불러올 수 없어요" onRetry={onRetry} />
      </div>
    );
  }

  // ok | stale — 둘 다 items가 있다. 빈 배열은 "지금 오는 버스가 없다"는 확인된 사실.
  return (
    <div className="arrivals">
      {result.kind === 'stale' ? <StaleDataLabel cachedAt={result.cachedAt} /> : null}
      {result.items.length === 0 ? (
        <p className="arrivals__notice">지금 도착 예정인 버스가 없어요</p>
      ) : (
        <ul className="arrivals__list">
          {result.items.map((a) => (
            <ArrivalRow key={`${a.routeName}-${a.arrivalSec}`} arrival={a} />
          ))}
        </ul>
      )}
    </div>
  );
}
