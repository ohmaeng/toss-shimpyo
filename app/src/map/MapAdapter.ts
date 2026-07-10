import type { LatLng } from '../domain/geo';

export type MarkerKind = 'stop' | 'shelter' | 'me';

export interface MarkerSpec {
  readonly id: string;
  readonly coord: LatLng;
  readonly kind: MarkerKind;
  readonly label: string;
}

export interface MapInitOptions {
  readonly center: LatLng;
  readonly level: number;
}

/**
 * 지도 어댑터.
 *
 * Kakao / Leaflet / 리스트 구현체를 교체해도 화면 코드는 손대지 않는다.
 * 리스트 구현체도 같은 인터페이스를 만족한다 — 마커는 리스트 항목이고, 탭은 항목 선택이다.
 * 이 계약이 지켜지면 지도가 죽어도 앱은 산다.
 */
export interface MapAdapter {
  readonly kind: AdapterKind;
  init(container: HTMLElement, opts: MapInitOptions): Promise<void>;
  setCenter(coord: LatLng): void;
  setMarkers(markers: readonly MarkerSpec[]): void;
  onMarkerTap(handler: (id: string) => void): void;
  panTo(coord: LatLng): void;
  destroy(): void;
}

export type AdapterKind = 'kakao' | 'leaflet' | 'list';

/** [불변] 폴백 체인 순서. 각 단계 실패 판정 후 즉시 다음 단계로. */
export const FALLBACK_CHAIN: readonly AdapterKind[] = ['kakao', 'leaflet', 'list'];

/** SDK 로드 타임아웃. 무한 로딩을 "로딩 중"으로 방치하지 않는다. */
export const MAP_LOAD_TIMEOUT_MS = 5_000;

export class MapLoadError extends Error {
  constructor(
    readonly adapter: AdapterKind,
    reason: string,
  ) {
    super(`${adapter} 지도 로드 실패: ${reason}`);
    this.name = 'MapLoadError';
  }
}

export function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(onTimeout()), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
