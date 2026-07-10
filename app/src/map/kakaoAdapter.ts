import type { LatLng } from '../domain/geo';
import {
  MapLoadError,
  MAP_LOAD_TIMEOUT_MS,
  withTimeout,
  type MapAdapter,
  type MapInitOptions,
  type MarkerSpec,
} from './MapAdapter';

/**
 * Kakao Map JS SDK 어댑터 — 폴백 체인 ①
 *
 * 알려진 함정: 토스 WebView에서 `window.kakao.maps`가 영원히 로드되지 않는 사례가
 * 커뮤니티에 보고돼 있다. 원인은 SDK가 geometry·marker 등 하위 모듈을
 * `t1.daumcdn.net`에서 **동적 fetch**하기 때문 — 로더 도메인(dapi.kakao.com)만
 * 화이트리스트에 넣으면 기본 지도만 뜨고 마커에서 죽는다.
 *
 * 그래서 이 어댑터는 두 단계로 검증한다:
 *   1) 스크립트 로드 + kakao.maps.load 콜백 (5초 타임아웃)
 *   2) **마커 1개 실제 생성** — 여기서 실패하면 폴백. "기본 지도만 뜨는 것"은 통과가 아니다.
 */

interface KakaoLatLng {
  getLat(): number;
  getLng(): number;
}
interface KakaoMarker {
  setMap(map: unknown | null): void;
}
interface KakaoMap {
  setCenter(ll: KakaoLatLng): void;
  panTo(ll: KakaoLatLng): void;
}
interface KakaoMaps {
  load(cb: () => void): void;
  LatLng: new (lat: number, lng: number) => KakaoLatLng;
  Map: new (el: HTMLElement, opts: { center: KakaoLatLng; level: number }) => KakaoMap;
  Marker: new (opts: { position: KakaoLatLng; title?: string }) => KakaoMarker;
  event: {
    addListener(target: unknown, type: string, handler: () => void): void;
  };
}

declare global {
  interface Window {
    kakao?: { maps?: KakaoMaps };
  }
}

const SDK_ID = 'kakao-map-sdk';

function loadScript(appKey: string): Promise<KakaoMaps> {
  return new Promise((resolve, reject) => {
    if (window.kakao?.maps) {
      resolve(window.kakao.maps);
      return;
    }
    const existing = document.getElementById(SDK_ID);
    if (existing) existing.remove();

    const s = document.createElement('script');
    s.id = SDK_ID;
    // autoload=false → kakao.maps.load()를 우리가 부른다. 그래야 실패를 감지할 수 있다.
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false`;
    s.async = true;
    s.onerror = () => reject(new MapLoadError('kakao', '스크립트 로드 실패 (도메인 화이트리스트 확인)'));
    s.onload = () => {
      const maps = window.kakao?.maps;
      if (!maps) {
        reject(new MapLoadError('kakao', 'window.kakao.maps 미정의'));
        return;
      }
      // 이 콜백이 안 오는 것이 커뮤니티에서 보고된 무한 로딩의 정확한 증상이다.
      maps.load(() => resolve(maps));
    };
    document.head.appendChild(s);
  });
}

export class KakaoAdapter implements MapAdapter {
  readonly kind = 'kakao' as const;
  private maps: KakaoMaps | null = null;
  private map: KakaoMap | null = null;
  private markers: KakaoMarker[] = [];
  private tapHandler: ((id: string) => void) | null = null;

  constructor(private readonly appKey: string) {}

  async init(container: HTMLElement, opts: MapInitOptions): Promise<void> {
    if (!this.appKey) throw new MapLoadError('kakao', 'VITE_KAKAO_JS_KEY 미설정');

    const maps = await withTimeout(
      loadScript(this.appKey),
      MAP_LOAD_TIMEOUT_MS,
      () => new MapLoadError('kakao', `${MAP_LOAD_TIMEOUT_MS}ms 내 미로드 (t1.daumcdn.net 화이트리스트 확인)`),
    );

    const map = new maps.Map(container, {
      center: new maps.LatLng(opts.center.lat, opts.center.lng),
      level: opts.level,
    });

    // 헬스체크: 마커를 실제로 만들어본다. 동적 모듈이 안 오면 여기서 던진다.
    try {
      const probe = new maps.Marker({ position: new maps.LatLng(opts.center.lat, opts.center.lng) });
      probe.setMap(map);
      probe.setMap(null);
    } catch (e) {
      throw new MapLoadError('kakao', `마커 생성 실패 — 동적 모듈 미로드 (${String(e)})`);
    }

    this.maps = maps;
    this.map = map;
  }

  setCenter(coord: LatLng): void {
    if (!this.maps || !this.map) return;
    this.map.setCenter(new this.maps.LatLng(coord.lat, coord.lng));
  }

  panTo(coord: LatLng): void {
    if (!this.maps || !this.map) return;
    this.map.panTo(new this.maps.LatLng(coord.lat, coord.lng));
  }

  setMarkers(specs: readonly MarkerSpec[]): void {
    if (!this.maps || !this.map) return;
    for (const m of this.markers) m.setMap(null);
    this.markers = [];

    for (const spec of specs) {
      const marker = new this.maps.Marker({
        position: new this.maps.LatLng(spec.coord.lat, spec.coord.lng),
        title: spec.label,
      });
      marker.setMap(this.map);
      this.maps.event.addListener(marker, 'click', () => this.tapHandler?.(spec.id));
      this.markers.push(marker);
    }
  }

  onMarkerTap(handler: (id: string) => void): void {
    this.tapHandler = handler;
  }

  destroy(): void {
    for (const m of this.markers) m.setMap(null);
    this.markers = [];
    this.map = null;
    this.maps = null;
  }
}
