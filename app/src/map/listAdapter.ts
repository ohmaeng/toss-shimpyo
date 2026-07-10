import type { LatLng } from '../domain/geo';
import type { MapAdapter, MapInitOptions, MarkerSpec } from './MapAdapter';

/**
 * 리스트 어댑터 — 폴백 체인 ③ (Approach A로의 자연 강등)
 *
 * 지도가 없다. 마커는 리스트 항목이고 탭은 항목 선택이다.
 * MapAdapter 계약을 그대로 만족하므로 화면 코드는 이 어댑터가 활성인지 모른다.
 *
 * 이 어댑터가 존재하는 한, 지도 SDK가 전부 막혀도 앱은 출시 가능하다.
 * 절대 실패하지 않는다 — init은 throw하지 않는다.
 */
export class ListAdapter implements MapAdapter {
  readonly kind = 'list' as const;
  private container: HTMLElement | null = null;
  private tapHandler: ((id: string) => void) | null = null;

  async init(container: HTMLElement, _opts: MapInitOptions): Promise<void> {
    this.container = container;
    container.classList.add('map-list-fallback');
  }

  /** 지도가 없으므로 중심 개념도 없다. 계약을 만족시키기 위한 no-op. */
  setCenter(_coord: LatLng): void {}

  panTo(_coord: LatLng): void {}

  setMarkers(specs: readonly MarkerSpec[]): void {
    const el = this.container;
    if (!el) return;
    el.replaceChildren();

    const stops = specs.filter((s) => s.kind === 'stop');
    const shelters = specs.filter((s) => s.kind === 'shelter');
    if (stops.length === 0) return;

    const ul = document.createElement('ul');
    ul.className = 'map-list';
    for (const spec of stops) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'map-list-item';
      btn.textContent = spec.label;
      btn.addEventListener('click', () => this.tapHandler?.(spec.id));
      li.appendChild(btn);
      ul.appendChild(li);
    }
    el.appendChild(ul);

    /**
     * 쉼터를 버리지 않는다.
     *
     * 지도가 없는 폴백에서 쉼터 마커를 그냥 무시하면, 폭염특보가 없는 날 첫 화면에는
     * 여름 신호가 하나도 남지 않는다 — 그냥 버스 정류장 목록이 된다.
     * 테마 적합성은 심사 항목이고, 폴백 ③은 실기기에서 충분히 일어날 수 있는 경로다.
     */
    if (shelters.length > 0) {
      const section = document.createElement('section');
      section.className = 'map-list-shelters';

      const h = document.createElement('h2');
      h.className = 'map-list-shelters__heading';
      h.textContent = `주변 무더위쉼터 ${shelters.length}곳`;
      section.appendChild(h);

      const sul = document.createElement('ul');
      sul.className = 'map-list-shelters__list';
      for (const spec of shelters) {
        const li = document.createElement('li');
        li.className = 'map-list-shelters__item';
        li.textContent = spec.label;
        sul.appendChild(li);
      }
      section.appendChild(sul);
      el.appendChild(section);
    }
  }

  onMarkerTap(handler: (id: string) => void): void {
    this.tapHandler = handler;
  }

  destroy(): void {
    this.container?.classList.remove('map-list-fallback');
    this.container?.replaceChildren();
    this.container = null;
  }
}
