/**
 * 이벤트 로깅.
 *
 * 앱인토스 SDK에 Analytics(screen/impression/click)가 내장돼 있다 —
 * 외부 analytics 스크립트를 로드할 필요가 없고, 따라서 WebView CSP에 막히지 않는다.
 * (계획서의 스파이크 ⑥ 우려가 해소된 지점. docs/확정-아키텍처-메모.md §2)
 *
 * 콘솔 기본 지표의 범위가 아직 미확인이므로(D7 코호트·즐겨찾기 등록률을 주는지 불명),
 * 프록시 로깅 엔드포인트로도 함께 전송한다. 둘 중 하나가 죽어도 8월 심사 기간의 지표를 잃지 않는다.
 *
 * [규칙] 개인 식별 정보를 남기지 않는다. 좌표는 시군구 코드로만 남긴다.
 */
import { Analytics } from '@apps-in-toss/web-framework';
import { PROXY_BASE } from '../api/config';

export type EventName =
  | 'app_open'
  | 'stop_card_view'
  | 'favorite_add'
  | 'favorite_remove'
  | 'alt_stop_shown'
  | 'alt_stop_tap'
  | 'report_link_tap'
  | 'map_adapter_resolved'
  | 'location_permission_denied'
  | 'arrivals_unavailable';

type Params = Record<string, string | number | boolean>;

const SCREEN_EVENTS: ReadonlySet<EventName> = new Set(['app_open', 'stop_card_view']);
const CLICK_EVENTS: ReadonlySet<EventName> = new Set([
  'favorite_add',
  'favorite_remove',
  'alt_stop_tap',
  'report_link_tap',
]);

function toProxy(name: EventName, params: Params): void {
  if (!PROXY_BASE) return;
  const body = JSON.stringify({ name, params, ts: Date.now() });
  try {
    // sendBeacon은 화면 전환 중에도 유실이 적고, 실패해도 앱을 막지 않는다.
    if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
      navigator.sendBeacon(`${PROXY_BASE}/api/log`, new Blob([body], { type: 'application/json' }));
      return;
    }
    void fetch(`${PROXY_BASE}/api/log`, { method: 'POST', body, keepalive: true }).catch(() => {});
  } catch {
    /* 로깅 실패가 앱을 죽이면 안 된다 */
  }
}

/** 로깅은 절대 throw하지 않는다. 지표 때문에 코어 플로우가 죽는 일은 없어야 한다. */
export function track(name: EventName, params: Params = {}): void {
  const payload = { log_name: name, ...params };
  try {
    if (SCREEN_EVENTS.has(name)) void Analytics.screen(payload);
    else if (CLICK_EVENTS.has(name)) void Analytics.click(payload);
    else void Analytics.impression(payload);
  } catch {
    /* 브라우저 dev 환경에서는 브릿지가 없다 */
  }
  toProxy(name, params);
}
