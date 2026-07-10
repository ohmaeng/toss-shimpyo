/**
 * 인메모리 캐시 + stale-while-revalidate + 동시요청 병합.
 *
 * 서버리스 함수는 인스턴스가 재활용될 때만 캐시가 살아있다. 그래도 의미가 크다:
 * 출근 시간에 같은 정류장을 여러 사람이 동시에 조회하면 원 API 호출이 1건으로 합쳐진다.
 * (영속 캐시가 필요해지면 Vercel KV / CF KV로 교체 — 인터페이스는 그대로.)
 */

interface Entry<T> {
  value: T;
  storedAt: number;
}

export interface CacheResult<T> {
  value: T;
  /** true면 원 API가 실패해서 오래된 값을 주는 것이다. 클라이언트가 "○분 전 정보"로 표시한다. */
  stale: boolean;
  cachedAt: number;
}

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

/** stale 값을 최대 이 시간까지만 준다. 그 이상 오래된 도착정보는 거짓말에 가깝다. */
const MAX_STALE_MS = 10 * 60_000;

export class UpstreamError extends Error {}

/**
 * @param ttlMs 신선하다고 간주하는 기간
 * @throws UpstreamError 캐시도 없고 원 API도 실패했을 때. 호출부가 unavailable로 변환한다.
 */
export async function cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<CacheResult<T>> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;

  if (hit && now - hit.storedAt < ttlMs) {
    return { value: hit.value, stale: false, cachedAt: hit.storedAt };
  }

  // 동시요청 병합 — thundering herd 방지. 쿼터가 목적이다.
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) {
    try {
      const value = await existing;
      return { value, stale: false, cachedAt: Date.now() };
    } catch {
      /* 아래 stale 폴백으로 */
    }
  } else {
    const p = fetcher();
    inflight.set(key, p);
    try {
      const value = await p;
      store.set(key, { value, storedAt: Date.now() });
      return { value, stale: false, cachedAt: Date.now() };
    } catch (e) {
      // 원 API 장애/쿼터 소진 → stale 폴백
      if (hit && now - hit.storedAt < MAX_STALE_MS) {
        return { value: hit.value, stale: true, cachedAt: hit.storedAt };
      }
      throw new UpstreamError(e instanceof Error ? e.message : String(e));
    } finally {
      inflight.delete(key);
    }
  }

  if (hit && now - hit.storedAt < MAX_STALE_MS) {
    return { value: hit.value, stale: true, cachedAt: hit.storedAt };
  }
  throw new UpstreamError('upstream 실패, 캐시 없음');
}
