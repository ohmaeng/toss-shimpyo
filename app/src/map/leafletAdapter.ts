import type { Map as LMap, Marker as LMarker } from 'leaflet';
import type { LatLng } from '../domain/geo';
import { MapLoadError, type MapAdapter, type MapInitOptions, type MarkerSpec } from './MapAdapter';

/**
 * Leaflet + OSM 타일 어댑터 — 폴백 체인 ②
 *
 * Leaflet은 npm에서 번들되므로 외부 스크립트 CDN에 의존하지 않는다(화이트리스트 항목 감소).
 * 타일 서버만 외부다. Kakao SDK가 막히는 상황에서도 타일은 단순 이미지 GET이라 통과할 확률이 높다.
 *
 * 동적 import 되므로, 지도 ①이 성공하면 이 코드는 다운로드조차 되지 않는다.
 */

const COLORS: Record<MarkerSpec['kind'], string> = {
  stop: '#2B2B2B',
  shelter: '#00B8A9',
  me: '#3182F6',
};

/**
 * 타일 소스.
 *
 * 프로덕션에서는 VWorld(국토지리정보원) 또는 자체 호스팅 타일을 써야 한다.
 * OSM 공개 타일 서버는 개발 중 저트래픽에서만 허용된다.
 */
function resolveTileSource(): { url: string | null; attribution: string } {
  const url = import.meta.env.VITE_TILE_URL as string | undefined;
  if (url) {
    return { url, attribution: (import.meta.env.VITE_TILE_ATTRIBUTION as string | undefined) ?? '' };
  }
  if (import.meta.env.DEV) {
    return { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© OpenStreetMap' };
  }
  return { url: null, attribution: '' };
}

export class LeafletAdapter implements MapAdapter {
  readonly kind = 'leaflet' as const;
  private map: LMap | null = null;
  private markers: LMarker[] = [];
  private tapHandler: ((id: string) => void) | null = null;
  private L: typeof import('leaflet') | null = null;

  async init(container: HTMLElement, opts: MapInitOptions): Promise<void> {
    const { url, attribution } = resolveTileSource();
    if (!url) {
      // 타일 소스가 없으면 지도를 띄우지 않는다.
      // OSM 공개 타일(tile.openstreetmap.org)은 상용·대량 트래픽 사용을 금지한다
      // (OSMF Tile Usage Policy). 전국 MAU 1,000+ 목표인 이 앱이 프로덕션에서
      // 그걸 쓰면 ToS 위반이고 예고 없이 차단된다.
      // 조용히 위반하느니 리스트 폴백(③)으로 내려간다.
      throw new MapLoadError('leaflet', 'VITE_TILE_URL 미설정 (프로덕션에서 OSM 공개 타일 사용 금지)');
    }

    try {
      const [L] = await Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]);
      this.L = L;
      const map = L.map(container, { zoomControl: false, attributionControl: true }).setView(
        [opts.center.lat, opts.center.lng],
        // Kakao의 level(작을수록 확대)과 Leaflet zoom(클수록 확대)은 반대다.
        Math.max(10, 19 - opts.level),
      );
      L.tileLayer(url, { maxZoom: 19, attribution }).addTo(map);
      this.map = map;
    } catch (e) {
      throw new MapLoadError('leaflet', String(e));
    }
  }

  setCenter(coord: LatLng): void {
    this.map?.setView([coord.lat, coord.lng]);
  }

  panTo(coord: LatLng): void {
    this.map?.panTo([coord.lat, coord.lng]);
  }

  setMarkers(specs: readonly MarkerSpec[]): void {
    const L = this.L;
    const map = this.map;
    if (!L || !map) return;

    for (const m of this.markers) m.remove();
    this.markers = [];

    for (const spec of specs) {
      // 색만으로 구분하지 않는다 — 쉼터는 사각형, 정류장은 원, 내 위치는 링.
      const shape = spec.kind === 'shelter' ? '4px' : '50%';
      const size = spec.kind === 'me' ? 14 : 20;
      const icon = L.divIcon({
        className: 'map-pin',
        html: `<div style="width:${size}px;height:${size}px;background:${COLORS[spec.kind]};border-radius:${shape};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });
      const marker = L.marker([spec.coord.lat, spec.coord.lng], {
        icon,
        title: spec.label,
        // 터치 타깃 44pt 확보 (persona-elderly)
        riseOnHover: true,
      }).addTo(map);
      marker.on('click', () => this.tapHandler?.(spec.id));
      this.markers.push(marker);
    }
  }

  onMarkerTap(handler: (id: string) => void): void {
    this.tapHandler = handler;
  }

  destroy(): void {
    for (const m of this.markers) m.remove();
    this.markers = [];
    this.map?.remove();
    this.map = null;
  }
}
