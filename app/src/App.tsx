import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { USE_MOCK } from './api/config';
import { AboutSheet } from './components/AboutSheet';
import { ErrorState } from './components/ErrorState';
import { HeatAlertBanner } from './components/HeatAlertBanner';
import { MapView } from './components/MapView';
import { SearchFallback } from './components/SearchFallback';
import { StopCard } from './components/StopCard';
import type { LatLng } from './domain/geo';
import { nearestShelter } from './domain/shelter';
import type { Stop } from './domain/types';
import { nearestStops } from './data/stops';
import { useLastViewedStop } from './hooks/useLastViewedStop';
import { useArrivalsPrefetch } from './hooks/useArrivalsPrefetch';
import { useFavorites } from './hooks/useFavorites';
import { useLocation } from './hooks/useLocation';
import { useNearbyStops } from './hooks/useNearbyStops';
import { useNetwork } from './hooks/useNetwork';
import { useWeather } from './hooks/useWeather';
import { track } from './platform/analytics';

/** 위치를 못 얻었을 때 지도의 기본 중심. 서울시청. */
const DEFAULT_CENTER: LatLng = { lat: 37.5665, lng: 126.978 };

export default function App() {
  const { state: loc, retry: retryLocation } = useLocation();
  const coord = loc.kind === 'ok' ? loc.coord : null;

  const { state: stops, retry: retryStops } = useNearbyStops(coord);
  const weather = useWeather(coord);
  const { offline } = useNetwork();
  const favorites = useFavorites();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  /** 검색 폴백에서 선택한 경우, 그 지역의 정류장 목록을 쓴다. */
  const [manual, setManual] = useState<{ stops: readonly Stop[]; dataDate: string } | null>(null);
  const autoOpened = useRef(false);

  useEffect(() => {
    track('app_open', { mock: USE_MOCK });
  }, []);

  const allStops: readonly Stop[] = manual?.stops ?? (stops.kind === 'ok' ? stops.data.stops : []);
  const dataDate = manual?.dataDate ?? (stops.kind === 'ok' ? stops.data.dataDate : '');

  const selected = useMemo(
    () => allStops.find((s) => s.id === selectedId) ?? null,
    [allStops, selectedId],
  );

  const lastViewed = useLastViewedStop(selectedId);

  /**
   * 앱을 열자마자 카드를 여는 두 가지 경우.
   *
   * 1) 즐겨찾기 (persona-commuter): 매일 같은 정류장에서 탄다.
   *    탭 0회로 "내 버스 몇 분" — D7 재방문율의 핵심 훅이다.
   * 2) 마지막으로 본 정류장 (persona-caregiver): 아기가 울어서 앱을 닫았다 다시 열었다.
   *    병원 앞 정류장은 일회성이라 즐겨찾기할 리 없다. 30분 안이면 그 자리로 되돌린다.
   *
   * 즐겨찾기가 우선한다. 30분이 지났으면 복원하지 않는다 — 어제 정류장을 오늘 열면 혼란스럽다.
   */
  useEffect(() => {
    if (autoOpened.current || !favorites.loaded || !lastViewed.loaded) return;
    if (selectedId !== null || allStops.length === 0) return;

    const fav = allStops.find((s) => favorites.isFavorite(s.id));
    const restore = fav ?? allStops.find((s) => s.id === lastViewed.stopId);
    if (restore) {
      autoOpened.current = true;
      setSelectedId(restore.id);
    }
  }, [favorites.loaded, favorites.isFavorite, lastViewed.loaded, lastViewed.stopId, allStops, selectedId]);

  // 즐겨찾기 정류장의 도착정보를 미리 데운다(카드가 즉시 채워지도록).
  useArrivalsPrefetch(allStops, favorites.ids);

  const handleSelectFromSearch = useCallback(
    (stop: Stop, all: readonly Stop[], dd: string) => {
      setManual({ stops: all, dataDate: dd });
      setSelectedId(stop.id);
    },
    [],
  );

  const nearby = useMemo(
    () => (coord && allStops.length > 0 ? nearestStops(coord, allStops, 5) : []),
    [coord, allStops],
  );

  /**
   * 폭염 배너가 행동을 제시하기 위한 값 — 주변 정류장 중 가장 가까운 쉼터까지의 도보(분).
   * 확인된 쉼터가 하나도 없으면 null이고, 배너는 조언 대신 특보 사실만 알린다.
   */
  const nearestShelterWalkMin = useMemo(() => {
    const mins = nearby
      .map(({ stop }) => nearestShelter(stop)?.walkMin)
      .filter((m): m is number => typeof m === 'number');
    return mins.length > 0 ? Math.min(...mins) : null;
  }, [nearby]);

  return (
    <div className="app">
      {offline ? (
        <div className="global-banner global-banner--offline" role="status">
          오프라인이에요. 표시된 정보는 최신이 아닐 수 있어요.
        </div>
      ) : null}
      {/* "목 데이터"는 개발자 용어다. 71세 사용자는 "목"이 무슨 말인지 모른다. */}
      {USE_MOCK ? (
        <div className="global-banner global-banner--mock" role="status">
          예시 데이터예요. 실제 버스 도착정보가 아니에요.
        </div>
      ) : null}

      {/*
        상시 워드마크. 폭염특보는 발효 중일 때만 뜨므로, 흐린 날 첫 화면에 여름 신호가 하나도
        남지 않는 문제가 있었다. 테마 적합성은 심사 항목이고 첫인상은 5초 안에 결정된다.
        쉼터가 확인되면 그 거리까지 여기서 말한다 — 특보가 없어도 이 앱이 뭘 하는지 즉시 드러난다.
      */}
      <header className="app__header">
        <h1 className="app__wordmark">쉼표 정류장</h1>
        <p className="app__tagline">
          {nearestShelterWalkMin !== null
            ? `기다리는 동안 시원한 곳 · 가장 가까운 쉼터 걸어서 ${nearestShelterWalkMin}분`
            : '버스를 기다리는 동안, 어디가 시원한지'}
        </p>
      </header>

      <HeatAlertBanner weather={weather} nearestShelterWalkMin={nearestShelterWalkMin} />

      <main className="app__main">
        {loc.kind === 'loading' ? <div className="skeleton skeleton--map" /> : null}

        {loc.kind === 'denied' ? (
          <SearchFallback onSelectStop={handleSelectFromSearch} onRetryLocation={retryLocation} />
        ) : null}

        {loc.kind === 'unavailable' ? (
          <ErrorState
            title="현재 위치를 찾지 못했어요"
            description="실내에서는 위치를 못 찾을 수 있어요."
            onRetry={retryLocation}
          />
        ) : null}

        {loc.kind === 'ok' ? (
          <>
            {stops.kind === 'loading' ? <div className="skeleton skeleton--map" /> : null}

            {stops.kind === 'error' ? (
              <ErrorState title="정류장 정보를 불러올 수 없어요" onRetry={retryStops} />
            ) : null}

            {stops.kind === 'ok' && allStops.length === 0 ? (
              <ErrorState
                title="주변에 정류장 데이터가 없어요"
                description="이 지역은 아직 지원하지 않아요."
              />
            ) : null}

            {stops.kind === 'ok' && allStops.length > 0 ? (
              <>
                <MapView center={coord ?? DEFAULT_CENTER} stops={allStops} onSelectStop={setSelectedId} />
                {selectedId === null ? (
                  <nav className="nearby" aria-label="내 주변 정류장">
                    <h2 className="nearby__heading">내 주변 정류장</h2>
                    <ul className="stop-list">
                      {nearby.map(({ stop, distanceM }) => (
                        <li key={stop.id}>
                          <button
                            type="button"
                            className="stop-list__item"
                            onClick={() => setSelectedId(stop.id)}
                          >
                            <span>{stop.name}</span>
                            <span className="stop-list__dist">{distanceM}m</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </nav>
                ) : null}
              </>
            ) : null}
          </>
        ) : null}

        {selected ? (
          <div className="sheet">
            <StopCard
              stop={selected}
              allStops={allStops}
              dataDate={dataDate}
              weather={weather}
              isFavorite={favorites.isFavorite(selected.id)}
              onToggleFavorite={favorites.toggle}
              onSelectStop={setSelectedId}
              onClose={() => setSelectedId(null)}
            />
          </div>
        ) : null}

        {aboutOpen ? (
          <div className="sheet">
            <AboutSheet dataDate={dataDate} onClose={() => setAboutOpen(false)} />
          </div>
        ) : null}
      </main>

      {/* 데이터 출처 표기·위치정보 고지로 가는 상시 진입점. 규정 항목이므로 항상 도달 가능해야 한다. */}
      <footer className="app__footer">
        <button type="button" className="app__about-link" onClick={() => setAboutOpen(true)}>
          데이터 출처 · 위치정보 안내
        </button>
      </footer>
    </div>
  );
}
