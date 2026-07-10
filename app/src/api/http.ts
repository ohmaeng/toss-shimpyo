export class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
    this.name = 'HttpError';
  }
}

export class TimeoutError extends Error {
  constructor() {
    super('요청 시간이 초과되었습니다');
    this.name = 'TimeoutError';
  }
}

interface FetchOpts {
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

export interface JsonWithAge<T> {
  readonly body: T;
  /**
   * 이 응답이 캐시에서 나온 나이(초). HTTP `Age` 헤더.
   *
   * 프록시는 CDN(`s-maxage`)에 캐싱되고, 원 API 장애 시 CDN이 `stale-while-revalidate`로
   * 오래된 응답을 계속 준다. 그때 body의 `kind`는 여전히 'ok'다 —
   * 응답이 몇 초 된 것인지는 오직 이 헤더만이 안다.
   *
   * 이걸 무시하면 앱이 10분 전 도착정보를 실시간인 척 말하게 된다.
   */
  readonly ageSec: number;
}

/**
 * 타임아웃이 있는 fetch. 타임아웃 없는 fetch는 무한 로딩의 원인이다.
 * 재시도는 호출부가 정한다 — 도착정보는 재시도하면 안 되고(오래된 정보가 된다),
 * 정적 JSON은 1회 재시도한다.
 */
export async function fetchJsonWithAge<T>(url: string, opts: FetchOpts = {}): Promise<JsonWithAge<T>> {
  const timeoutMs = opts.timeoutMs ?? 6_000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  const onAbort = () => ctrl.abort();
  opts.signal?.addEventListener('abort', onAbort);

  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new HttpError(res.status);
    const raw = res.headers.get('age');
    const ageSec = raw !== null && Number.isFinite(Number(raw)) ? Math.max(0, Number(raw)) : 0;
    return { body: (await res.json()) as T, ageSec };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError' && !opts.signal?.aborted) {
      throw new TimeoutError();
    }
    throw e;
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}

export async function fetchJson<T>(url: string, opts: FetchOpts = {}): Promise<T> {
  return (await fetchJsonWithAge<T>(url, opts)).body;
}

/** n회까지 재시도. 정적 JSON 로드에만 쓴다. */
export async function fetchJsonWithRetry<T>(url: string, retries: number, opts: FetchOpts = {}): Promise<T> {
  let last: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fetchJson<T>(url, opts);
    } catch (e) {
      last = e;
      if (opts.signal?.aborted) throw e;
      // 4xx는 재시도해도 같다
      if (e instanceof HttpError && e.status >= 400 && e.status < 500) throw e;
    }
  }
  throw last;
}
