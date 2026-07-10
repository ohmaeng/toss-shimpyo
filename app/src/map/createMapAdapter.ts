import { track } from '../platform/analytics';
import { FALLBACK_CHAIN, type AdapterKind, type MapAdapter, type MapInitOptions } from './MapAdapter';

const KAKAO_KEY: string = import.meta.env.VITE_KAKAO_JS_KEY ?? '';

/** 각 어댑터는 동적 import — 성공한 단계 이후의 코드는 다운로드되지 않는다. */
async function instantiate(kind: AdapterKind): Promise<MapAdapter> {
  switch (kind) {
    case 'kakao': {
      const { KakaoAdapter } = await import('./kakaoAdapter');
      return new KakaoAdapter(KAKAO_KEY);
    }
    case 'leaflet': {
      const { LeafletAdapter } = await import('./leafletAdapter');
      return new LeafletAdapter();
    }
    case 'list': {
      const { ListAdapter } = await import('./listAdapter');
      return new ListAdapter();
    }
  }
}

export interface ResolvedAdapter {
  readonly adapter: MapAdapter;
  /** 폴백이 발동했다면 앞 단계들의 실패 사유. 로깅·디버깅용. */
  readonly failures: readonly string[];
}

/**
 * [불변] 폴백 체인을 순서대로 시도해 첫 성공을 반환한다.
 *
 * 폴백 발동은 사용자에게 조용히 일어난다 — 에러 화면을 띄우지 않는다.
 * 다만 어떤 어댑터가 활성인지는 반드시 로깅한다(8월에 실기기 실패율을 알아야 하므로).
 *
 * 리스트 어댑터는 절대 실패하지 않으므로 이 함수는 항상 성공한다.
 */
export async function createMapAdapter(
  container: HTMLElement,
  opts: MapInitOptions,
): Promise<ResolvedAdapter> {
  const failures: string[] = [];

  for (const kind of FALLBACK_CHAIN) {
    try {
      const adapter = await instantiate(kind);
      await adapter.init(container, opts);
      track('map_adapter_resolved', { adapter: kind, fallback_count: failures.length });
      return { adapter, failures };
    } catch (e) {
      failures.push(`${kind}: ${e instanceof Error ? e.message : String(e)}`);
      // 다음 단계로 넘어가기 전에 컨테이너를 비운다. 실패한 SDK의 잔해가 남는다.
      container.replaceChildren();
    }
  }

  // 도달 불가 — ListAdapter.init은 throw하지 않는다. 방어적으로만 남긴다.
  throw new Error(`모든 지도 어댑터 실패: ${failures.join(' | ')}`);
}
