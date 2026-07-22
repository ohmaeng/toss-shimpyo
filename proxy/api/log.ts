/**
 * 이벤트 로깅 엔드포인트.
 *
 * 앱인토스 SDK의 Analytics가 이미 있지만, 콘솔 기본 지표가 D7 코호트·즐겨찾기 등록률까지
 * 주는지 확인되지 않았다. 8월 심사 기간에 지표를 잃는 것이 최악이므로 이중으로 남긴다.
 *
 * [개인정보] 좌표·기기 식별자를 받지 않는다. 받더라도 저장하지 않는다.
 * 화이트리스트에 없는 필드는 버린다 — 실수로 PII가 흘러드는 것을 구조적으로 막는다.
 */

const ALLOWED_EVENTS = new Set([
  'app_open',
  'stop_card_view',
  'favorite_add',
  'favorite_remove',
  'alt_stop_shown',
  'alt_stop_tap',
  'report_link_tap',
  'map_adapter_resolved',
  'location_permission_denied',
  'arrivals_unavailable',
]);

/** 이 키만 저장한다. 그 외는 조용히 버린다. */
const ALLOWED_PARAM_KEYS = new Set([
  'stop_id',
  'route',
  'walk_min',
  'adapter',
  'fallback_count',
  'arrival_supported',
  'retried',
  'mock',
]);

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response(null, { status: 405 });

  try {
    const body = (await req.json()) as { name?: string; params?: Record<string, unknown>; ts?: number };
    if (!body.name || !ALLOWED_EVENTS.has(body.name)) return new Response(null, { status: 204 });

    const params: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body.params ?? {})) {
      if (ALLOWED_PARAM_KEYS.has(k)) params[k] = v;
    }

    // 현재는 stdout. Vercel 로그 드레인이나 KV로 옮길 때 이 지점만 바꾼다.
    console.log(JSON.stringify({ event: body.name, params, ts: body.ts ?? Date.now() }));
  } catch {
    /* 잘못된 페이로드는 조용히 버린다. 로깅 실패가 앱을 죽이면 안 된다. */
  }

  // 항상 204. 클라이언트는 응답을 보지 않는다(sendBeacon).
  return new Response(null, { status: 204 });
}
