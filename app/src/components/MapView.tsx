import { useEffect, useRef, useState } from 'react';
import type { LatLng } from '../domain/geo';
import { distanceMeters } from '../domain/geo';
import type { Stop } from '../domain/types';
import { nearestShelter } from '../domain/shelter';
import { createMapAdapter } from '../map/createMapAdapter';
import type { AdapterKind, MapAdapter, MarkerSpec } from '../map/MapAdapter';

/** 뷰포트 밖 마커는 렌더하지 않는다. 시군구 하나에 정류장이 수천 개일 수 있다. */
const MAX_MARKERS = 60;
const MARKER_RADIUS_M = 1_500;

function buildMarkers(center: LatLng, stops: readonly Stop[]): MarkerSpec[] {
  const near = stops
    .map((s) => ({ s, d: distanceMeters(center, { lat: s.lat, lng: s.lng }) }))
    .filter((x) => x.d <= MARKER_RADIUS_M)
    .sort((a, b) => a.d - b.d)
    .slice(0, MAX_MARKERS);

  const markers: MarkerSpec[] = [{ id: '__me__', coord: center, kind: 'me', label: '내 위치' }];

  const shelterSeen = new Set<string>();
  for (const { s } of near) {
    markers.push({ id: s.id, coord: { lat: s.lat, lng: s.lng }, kind: 'stop', label: s.name });
    const sh = nearestShelter(s);
    if (sh && !shelterSeen.has(sh.name)) {
      shelterSeen.add(sh.name);
      markers.push({
        id: `shelter:${sh.name}`,
        coord: { lat: sh.lat, lng: sh.lng },
        kind: 'shelter',
        label: sh.name,
      });
    }
  }
  return markers;
}

/**
 * 지도 화면.
 *
 * 어느 어댑터가 활성인지 화면 코드는 모른다. 리스트 폴백이어도 이 컴포넌트는 동일하게 동작한다.
 * 폴백 발동은 사용자에게 조용히 일어난다 — 에러 화면을 띄우지 않는다.
 */
export function MapView({
  center,
  stops,
  onSelectStop,
}: {
  center: LatLng;
  stops: readonly Stop[];
  onSelectStop: (stopId: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const adapterRef = useRef<MapAdapter | null>(null);
  const [kind, setKind] = useState<AdapterKind | null>(null);
  const onSelectRef = useRef(onSelectStop);
  onSelectRef.current = onSelectStop;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let disposed = false;

    void (async () => {
      const { adapter, failures } = await createMapAdapter(el, { center, level: 4 });
      if (disposed) {
        adapter.destroy();
        return;
      }
      if (failures.length > 0) console.warn('[map] 폴백 발동:', failures);
      adapter.onMarkerTap((id) => {
        if (id.startsWith('shelter:') || id === '__me__') return;
        onSelectRef.current(id);
      });
      adapterRef.current = adapter;
      setKind(adapter.kind);
    })();

    return () => {
      disposed = true;
      adapterRef.current?.destroy();
      adapterRef.current = null;
    };
    // 지도는 최초 1회만 생성한다. center 변경은 panTo로 처리한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    adapterRef.current?.panTo(center);
  }, [center.lat, center.lng]);

  useEffect(() => {
    if (!kind) return;
    adapterRef.current?.setMarkers(buildMarkers(center, stops));
  }, [kind, center, stops]);

  return (
    <div className="map-view">
      <div ref={ref} className="map-view__canvas" />
      {kind === null ? <div className="map-view__loading">지도를 준비하고 있어요</div> : null}
    </div>
  );
}
