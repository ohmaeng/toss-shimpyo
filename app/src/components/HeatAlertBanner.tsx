import type { WeatherResult } from '../api/types';

/**
 * 폭염특보 배너.
 *
 * 특보가 발효 중일 때만 뜬다. 항상 떠 있으면 무시된다.
 * 특보 API 실패 시에도 숨긴다 — 없는 특보를 띄우는 오탐 한 번이면
 * 사용자는 배너 전체를 무시하기 시작한다.
 *
 * [3상태] "그늘"을 언급하지 않는다. v1에 그늘 데이터가 없다.
 * 없는 데이터를 "확인하세요"라고 말하는 것은 단정 표기다.
 *
 * 세 페르소나 모두 같은 불만을 냈다: "덥다는 건 나도 안다. 등이 이미 젖었다."
 * 그래서 배너는 상태가 아니라 **행동**을 준다 — 가장 가까운 쉼터가 몇 분 거리인지.
 * 그 값을 모르면 조언하지 않고 특보 사실만 알린다.
 */
export function HeatAlertBanner({
  weather,
  nearestShelterWalkMin,
}: {
  weather: WeatherResult | null;
  /** 주변 정류장 중 가장 가까운 쉼터까지의 도보(분). 확인 불가면 null. */
  nearestShelterWalkMin: number | null;
}) {
  if (!weather || weather.kind === 'unavailable') return null;
  const alert = weather.value.heatAlert;
  if (!alert) return null;

  const temp = weather.value.tempC;
  const stale = weather.kind === 'stale';

  return (
    <div className={`heat-banner heat-banner--${alert.level === '폭염경보' ? 'severe' : 'warn'}`} role="status">
      <div className="heat-banner__row">
        <strong className="heat-banner__level">{alert.level}</strong>
        {temp !== null ? (
          <span className="heat-banner__temp">
            {temp.toFixed(1)}°C{stale ? <span className="heat-banner__stale"> · 조금 전 정보</span> : null}
          </span>
        ) : null}
      </div>
      <p className="heat-banner__action">
        {nearestShelterWalkMin !== null
          ? `가장 가까운 무더위쉼터는 걸어서 ${nearestShelterWalkMin}분 거리예요`
          : `${alert.areaName} · 실내나 그늘에서 기다리세요`}
      </p>
    </div>
  );
}
