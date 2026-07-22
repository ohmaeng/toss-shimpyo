import { cached, UpstreamError } from '../lib/cache';
import { nowcastBase, toGrid } from '../lib/kmaGrid';

/**
 * 기상청 프록시 — 기온 + 폭염특보.
 *
 * [불변] 특보 판정이 불가하면 heatAlert=null 을 준다 → 클라이언트가 배너를 숨긴다.
 * 없는 특보를 띄우는 오탐 한 번이면 사용자는 배너 전체를 무시하기 시작한다.
 * 그래서 이 파일의 모든 실패 경로는 heatAlert=null 로 수렴한다.
 *
 * 기온은 초단기실황(T1H)에서 가져온다. 10분 캐싱 — 특보와 기온 모두 그보다 자주 안 바뀐다.
 */

const NCST_URL = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst';
const WRN_URL = 'https://apis.data.go.kr/1360000/WthrWrnInfoService/getWthrWrnList';
const TTL_MS = 10 * 60_000;

interface WeatherValue {
  tempC: number | null;
  heatAlert: { level: '폭염주의보' | '폭염경보'; areaName: string } | null;
}

function serviceKey(): string {
  const key = process.env.DATA_GO_KR_SERVICE_KEY;
  if (!key) throw new Error('DATA_GO_KR_SERVICE_KEY 미설정');
  return key;
}

async function getJson(url: URL, timeoutMs = 5_000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/** 초단기실황에서 T1H(기온). 실패하면 null — 기온 없이도 앱은 동작한다. */
async function fetchTemp(lat: number, lng: number): Promise<number | null> {
  try {
    const { nx, ny } = toGrid(lat, lng);
    const { baseDate, baseTime } = nowcastBase(new Date());
    const url = new URL(NCST_URL);
    url.searchParams.set('serviceKey', serviceKey());
    url.searchParams.set('_type', 'json');
    url.searchParams.set('numOfRows', '20');
    url.searchParams.set('base_date', baseDate);
    url.searchParams.set('base_time', baseTime);
    url.searchParams.set('nx', String(nx));
    url.searchParams.set('ny', String(ny));

    const body = (await getJson(url)) as {
      response?: { body?: { items?: { item?: { category?: string; obsrValue?: string }[] } } };
    };
    const items = body.response?.body?.items?.item ?? [];
    const t1h = items.find((i) => i.category === 'T1H');
    if (!t1h?.obsrValue) return null;
    const v = Number(t1h.obsrValue);
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * 폭염특보.
 *
 * TODO(사람): 기상청 특보 API의 정확한 오퍼레이션·응답 스키마를 포털 문서로 검증할 것.
 * 검증 전까지 이 함수는 파싱 실패 시 null을 반환하고, 그러면 배너가 안 뜬다.
 * 즉 "특보를 놓치는" 미탐은 발생할 수 있어도, "없는 특보를 띄우는" 오탐은 발생하지 않는다.
 * 이 방향의 실패가 옳다.
 */
async function fetchHeatAlert(): Promise<WeatherValue['heatAlert']> {
  try {
    const url = new URL(WRN_URL);
    url.searchParams.set('serviceKey', serviceKey());
    url.searchParams.set('_type', 'json');
    url.searchParams.set('numOfRows', '50');
    url.searchParams.set('pageNo', '1');

    const body = (await getJson(url)) as {
      response?: { body?: { items?: { item?: { title?: string; areaName?: string }[] } } };
    };
    const items = body.response?.body?.items?.item;
    if (!Array.isArray(items)) return null;

    // 경보가 주의보보다 우선한다.
    const severe = items.find((i) => i.title?.includes('폭염경보'));
    if (severe) return { level: '폭염경보', areaName: severe.areaName ?? '' };
    const warn = items.find((i) => i.title?.includes('폭염주의보'));
    if (warn) return { level: '폭염주의보', areaName: warn.areaName ?? '' };
    return null;
  } catch {
    return null; // 판정 불가 → 배너 숨김
  }
}

async function fetchWeather(lat: number, lng: number): Promise<WeatherValue> {
  const [tempC, heatAlert] = await Promise.all([fetchTemp(lat, lng), fetchHeatAlert()]);
  // 둘 다 실패하면 캐시/stale로 넘긴다. 빈 껍데기를 정상 응답인 척 주지 않는다.
  if (tempC === null && heatAlert === null) throw new Error('기상 정보 없음');
  return { tempC, heatAlert };
}

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const lat = Number(url.searchParams.get('lat'));
  const lng = Number(url.searchParams.get('lng'));

  // arrivals와 동일한 이유로 CDN 계층 캐싱을 쓴다(인스턴스 무관 공유 + 장애 시 stale 서빙).
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control':
          status === 200
            ? 'public, max-age=0, s-maxage=600, stale-while-revalidate=3600'
            : 'public, max-age=0, s-maxage=0',
      },
    });

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return json({ kind: 'unavailable' }, 400);

  // 캐시 키를 격자 단위로 — 같은 격자의 사용자들이 한 건으로 합쳐진다.
  const { nx, ny } = toGrid(lat, lng);
  try {
    const r = await cached(`wx:${nx}:${ny}`, TTL_MS, () => fetchWeather(lat, lng));
    return json(
      {
        kind: r.stale ? 'stale' : 'ok',
        tempC: r.value.tempC,
        heatAlert: r.value.heatAlert,
        ...(r.stale ? { cachedAt: r.cachedAt } : {}),
      },
      200,
    );
  } catch (e) {
    if (e instanceof UpstreamError) return json({ kind: 'unavailable' }, 503);
    return json({ kind: 'unavailable' }, 503);
  }
}
