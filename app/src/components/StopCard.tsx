import { useEffect } from 'react';
import { REPORT_FORM_URL } from '../api/config';
import type { WeatherResult } from '../api/types';
import { findAltStop } from '../domain/altStop';
import { soonestArrivalSec } from '../domain/shelterTrip';
import type { Stop } from '../domain/types';
import { altStopCandidates } from '../data/stops';
import { useArrivals } from '../hooks/useArrivals';
import { track } from '../platform/analytics';
import { openExternalURL } from '../platform/bridge';
import { AltStopSuggestionCard } from './AltStopSuggestion';
import { ArrivalSection } from './ArrivalSection';
import { ShelterSection } from './ShelterSection';

/**
 * 정류장 카드 (바텀시트).
 *
 * 정보 위계 [고정]: 1순위 도착정보 · 2순위 쉼터 도보시간 · 3순위 기온·기타.
 */
export function StopCard({
  stop,
  allStops,
  dataDate,
  weather,
  isFavorite,
  onToggleFavorite,
  onSelectStop,
  onClose,
}: {
  stop: Stop;
  allStops: readonly Stop[];
  dataDate: string;
  weather: WeatherResult | null;
  isFavorite: boolean;
  onToggleFavorite: (stopId: string) => void;
  onSelectStop: (stopId: string) => void;
  onClose: () => void;
}) {
  const { result, loading, retry } = useArrivals(stop);

  useEffect(() => {
    track('stop_card_view', { stop_id: stop.id, arrival_supported: stop.arrivalSupported });
  }, [stop.id, stop.arrivalSupported]);

  // 4중 조건 판정. 통과하는 후보가 없으면 null이고, 섹션 자체가 렌더되지 않는다.
  const altStop = findAltStop(stop, altStopCandidates(stop, allStops));

  const tempC = weather && weather.kind !== 'unavailable' ? weather.value.tempC : null;
  // stale 기온을 "현재"라고 부르지 않는다.
  const tempStale = weather?.kind === 'stale';

  /**
   * 쉼터 왕복 조언의 입력.
   * stale 도착정보로도 조언한다 — 그 값은 이미 "○분 전 정보"로 표기되고 있고,
   * 조언 자체가 보수적(왕복 + 여유 3분)이라 한 번 더 안전하다.
   * unavailable/unsupported면 null → 조언하지 않는다.
   */
  const soonestSec =
    result && (result.kind === 'ok' || result.kind === 'stale') ? soonestArrivalSec(result.items) : null;

  return (
    <div className="stop-card" role="dialog" aria-label={`${stop.name} 정류장 정보`}>
      <header className="stop-card__header">
        <div className="stop-card__titles">
          <h2 className="stop-card__name">{stop.name}</h2>
          {tempC !== null ? (
            <span className="stop-card__temp">
              {tempStale ? '조금 전' : '현재'} {tempC.toFixed(1)}°C
            </span>
          ) : null}
        </div>
        {/* 별표와 닫기 사이 간격을 벌린다 — 손이 떨리면 닫으려다 즐겨찾기가 눌린다 */}
        <div className="stop-card__actions">
          <button
            type="button"
            className={`btn-icon ${isFavorite ? 'btn-icon--on' : ''}`}
            aria-pressed={isFavorite}
            aria-label={isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
            onClick={() => onToggleFavorite(stop.id)}
          >
            {isFavorite ? '★' : '☆'}
          </button>
          <button type="button" className="btn-icon" aria-label="닫기" onClick={onClose}>
            ✕
          </button>
        </div>
      </header>

      <ArrivalSection
        result={result}
        loading={loading}
        onRetry={retry}
        routeNames={stop.routes.map((r) => r.name)}
      />

      <ShelterSection stop={stop} dataDate={dataDate} soonestArrivalSec={soonestSec} />

      {altStop ? <AltStopSuggestionCard suggestion={altStop} onSelect={onSelectStop} /> : null}

      {/* 제보 폼이 설정되지 않았으면 버튼을 숨긴다 — 죽은 버튼을 보여주지 않는다 */}
      {REPORT_FORM_URL ? (
        <button
          type="button"
          className="btn btn--ghost stop-card__report"
          onClick={() => {
            track('report_link_tap', { stop_id: stop.id });
            void openExternalURL(`${REPORT_FORM_URL}?stop=${encodeURIComponent(stop.id)}`);
          }}
        >
          이 정류장 정보 제보하기
        </button>
      ) : null}
    </div>
  );
}
