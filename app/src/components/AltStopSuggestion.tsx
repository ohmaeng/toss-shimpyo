import { useEffect } from 'react';
import type { AltStopSuggestion as Suggestion } from '../domain/altStop';
import { track } from '../platform/analytics';

/**
 * 대안 정류장 제안 — 4중 조건을 모두 통과한 경우에만 이 컴포넌트가 렌더된다.
 *
 * persona-caregiver / persona-elderly 반영:
 * "저기가 더 시원해요"만 말하면 사용자가 스스로 "갔다 오면 버스 놓치지 않나?"를 계산해야 한다.
 * 조건 4(도보시간 ≤ 배차간격의 1/2)가 이미 그 계산을 했으므로, **그 결과를 말해준다.**
 * 이것이 이 앱이 지도 위에 정류장을 뿌리는 다른 앱과 다른 지점이다.
 */
export function AltStopSuggestionCard({
  suggestion,
  onSelect,
}: {
  suggestion: Suggestion;
  onSelect: (stopId: string) => void;
}) {
  useEffect(() => {
    track('alt_stop_shown', {
      stop_id: suggestion.stop.id,
      walk_min: suggestion.walkMin,
      route: suggestion.viaRoute.name,
    });
  }, [suggestion.stop.id, suggestion.walkMin, suggestion.viaRoute.name]);

  const current = suggestion.currentShelterWalk;
  const comparison =
    current.state === 'present'
      ? `쉼터까지 ${current.value}분 → ${suggestion.altShelterWalkMin}분`
      : `여기엔 가까운 쉼터가 없지만, 그곳은 쉼터까지 ${suggestion.altShelterWalkMin}분`;

  return (
    <section className="alt-stop">
      <h3 className="alt-stop__heading">더 시원하게 기다릴 수 있어요</h3>

      <button
        type="button"
        className="alt-stop__card"
        onClick={() => {
          track('alt_stop_tap', { stop_id: suggestion.stop.id });
          onSelect(suggestion.stop.id);
        }}
      >
        <span className="alt-stop__name">{suggestion.stop.name}</span>
        <span className="alt-stop__walk">
          걸어서 {suggestion.walkMin}분
          <span className="alt-stop__basis">직선거리 {suggestion.distanceM}m 기준</span>
        </span>
        <span className="alt-stop__comparison">{comparison}</span>
      </button>

      {/* 조건 4가 보장하는 사실을 사용자에게 그대로 돌려준다 */}
      <p className="alt-stop__safety">
        {suggestion.viaRoute.name}번은 약 {suggestion.viaRoute.intervalMin}분 간격이에요. 걸어가도 버스를 놓칠
        가능성이 낮아요.
      </p>
    </section>
  );
}
