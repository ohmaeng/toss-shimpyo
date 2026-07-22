import { cached, UpstreamError } from '../lib/cache';

/**
 * TAGO 실시간 도착정보 프록시.
 *
 * 존재 이유: serviceKey를 클라이언트에 노출하지 않기 위해서다.
 * CORS 허용 여부와 무관하게, 키가 쿼리스트링에 들어가는 API는 프록시가 강제된다.
 *
 * 계약 (app/src/api/types.ts 의 ArrivalsResult 와 1:1 대응):
 *   200 { kind: 'ok',   items: [...] }
 *   200 { kind: 'stale', items: [...], cachedAt }   원 API 장애 → 캐시된 마지막 응답
 *   404 { kind: 'unsupported' }                     이 지역/정류장은 미제공 (장애 아님)
 *   503 { kind: 'unavailable' }                     장애. items를 주지 않는다.
 *
 * [불변] 장애 시 빈 배열을 주지 않는다. 클라이언트가 "도착 예정 버스 없음"으로 표시하게 되기 때문이다.
 */

const TAGO_URL = 'https://apis.data.go.kr/1613000/ArvlInfoInqireService/getSttnAcctoArvlPrarngInfoList';
/** 폴링 주기 30초보다 짧게 — 사용자마다 캐시가 갱신되도록. */
const TTL_MS = 25_000;

interface TagoItem {
  routeno?: string | number;
  arrtime?: number;
  arrprevstationcnt?: number;
}

interface Arrival {
  routeName: string;
  arrivalSec: number;
  prevStopCount: number | null;
}

async function fetchTago(cityCode: string, nodeId: string): Promise<Arrival[]> {
  const key = process.env.DATA_GO_KR_SERVICE_KEY;
  if (!key) throw new Error('DATA_GO_KR_SERVICE_KEY 미설정');

  const url = new URL(TAGO_URL);
  url.searchParams.set('serviceKey', key);
  url.searchParams.set('cityCode', cityCode);
  url.searchParams.set('nodeId', nodeId);
  url.searchParams.set('_type', 'json');
  url.searchParams.set('numOfRows', '20');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`TAGO ${res.status}`);
    const body = (await res.json()) as {
      response?: { header?: { resultCode?: string }; body?: { items?: { item?: TagoItem | TagoItem[] } } };
    };

    const code = body.response?.header?.resultCode;
    // '03' = NODATA. 정상 응답이며 "지금 오는 버스가 없다"는 확인된 사실이다.
    if (code === '03') return [];
    if (code !== '00') {
      // resultCode가 없다는 것은 우리가 기대한 스키마가 아니라는 뜻이다(HTML 에러 페이지 등).
      // 이걸 빈 배열로 흘리면 클라이언트가 "도착 예정 버스 없음"으로 표시한다 — 장애의 데이터 위장.
      throw new Error(`TAGO 예상치 못한 응답 (resultCode=${code ?? 'none'})`);
    }

    const raw = body.response?.body?.items?.item;
    // resultCode='00'인데 items가 없는 경우는 실질적으로 NODATA다. 여기서만 빈 배열이 정당하다.
    if (raw === undefined) return [];
    const items = Array.isArray(raw) ? raw : [raw];

    return items
      .filter((i) => typeof i.arrtime === 'number')
      .map((i) => ({
        routeName: String(i.routeno ?? '').trim(),
        arrivalSec: Number(i.arrtime),
        prevStopCount: typeof i.arrprevstationcnt === 'number' ? i.arrprevstationcnt : null,
      }))
      .sort((a, b) => a.arrivalSec - b.arrivalSec);
  } finally {
    clearTimeout(timer);
  }
}

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const cityCode = url.searchParams.get('cityCode');
  const nodeId = url.searchParams.get('nodeId');

  /**
   * CDN 계층 캐싱이 이 프록시의 진짜 방어선이다.
   *
   * 인메모리 `cached()`는 서버리스 인스턴스가 웜일 때만 산다 — 콜드스타트마다 캐시가 사라지므로,
   * 전국에 흩어진 저트래픽 사용자에게는 쿼터 절감도 stale 방어선도 거의 작동하지 않는다.
   *
   * `s-maxage=25`는 Vercel Edge가 (cityCode, nodeId)별로 응답을 공유하게 만든다.
   * → 같은 정류장을 보는 모든 사용자의 상류 호출이 25초당 1건으로 합쳐진다(인스턴스 무관).
   * `stale-while-revalidate=600`은 원 API 장애 시 Edge가 캐시된 응답을 계속 준다.
   *
   * max-age=0: 브라우저는 캐싱하지 않는다. 폴링(30초)이 매번 Edge를 때려야
   * 카운트다운이 실제로 줄어든다. (TTL을 폴링보다 길게 잡으면 숫자가 얼어붙는다.)
   *
   * 주의: Edge가 stale을 줄 때 body의 kind는 여전히 'ok'다.
   * 그래서 클라이언트는 HTTP `Age` 헤더로 응답의 실제 나이를 판정한다 — app/src/api/arrivals.ts
   */
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control':
          status === 200
            ? 'public, max-age=0, s-maxage=25, stale-while-revalidate=600'
            : 'public, max-age=0, s-maxage=0',
      },
    });

  if (!cityCode || !nodeId) return json({ kind: 'unsupported' }, 404);
  if (!/^\d+$/.test(cityCode)) return json({ kind: 'unsupported' }, 404);

  try {
    const r = await cached(`arr:${cityCode}:${nodeId}`, TTL_MS, () => fetchTago(cityCode, nodeId));
    return json(
      r.stale
        ? { kind: 'stale', items: r.value, cachedAt: r.cachedAt }
        : { kind: 'ok', items: r.value },
      200,
    );
  } catch (e) {
    if (e instanceof UpstreamError) return json({ kind: 'unavailable' }, 503);
    return json({ kind: 'unavailable' }, 503);
  }
}
