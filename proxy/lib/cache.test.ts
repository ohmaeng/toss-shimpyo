import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cached, UpstreamError } from './cache';

let n = 0;
const key = () => `k${n++}`;

beforeEach(() => {
  vi.useRealTimers();
});

describe('cached — 캐시와 stale-while-revalidate', () => {
  it('첫 호출은 fetcher를 부르고 fresh를 준다', async () => {
    const fetcher = vi.fn().mockResolvedValue('v1');
    const r = await cached(key(), 1000, fetcher);
    expect(r).toMatchObject({ value: 'v1', stale: false });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('TTL 안에서는 fetcher를 다시 부르지 않는다 (쿼터 절약)', async () => {
    const k = key();
    const fetcher = vi.fn().mockResolvedValue('v1');
    await cached(k, 1000, fetcher);
    const r = await cached(k, 1000, fetcher);
    expect(r.stale).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('동시 요청을 하나로 병합한다 (thundering herd 방지)', async () => {
    const k = key();
    let resolve!: (v: string) => void;
    const fetcher = vi.fn().mockReturnValue(new Promise<string>((r) => (resolve = r)));

    const a = cached(k, 1000, fetcher);
    const b = cached(k, 1000, fetcher);
    resolve('v1');
    const [ra, rb] = await Promise.all([a, b]);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(ra.value).toBe('v1');
    expect(rb.value).toBe('v1');
  });

  it('원 API 장애 시 캐시된 값을 stale로 준다 — 이것이 8월 장애의 방어선', async () => {
    const k = key();
    await cached(k, 0, vi.fn().mockResolvedValue('old'));
    const r = await cached(k, 0, vi.fn().mockRejectedValue(new Error('TAGO 500')));
    expect(r.value).toBe('old');
    expect(r.stale).toBe(true);
    expect(r.cachedAt).toBeLessThanOrEqual(Date.now());
  });

  it('캐시도 없고 원 API도 실패하면 UpstreamError — 빈 배열을 지어내지 않는다', async () => {
    await expect(cached(key(), 1000, vi.fn().mockRejectedValue(new Error('down')))).rejects.toBeInstanceOf(
      UpstreamError,
    );
  });

  it('10분보다 오래된 캐시는 stale로도 주지 않는다', async () => {
    const k = key();
    const t0 = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(t0);
    await cached(k, 0, vi.fn().mockResolvedValue('ancient'));

    // 11분 뒤 — 이 시점의 도착정보는 거짓말에 가깝다
    vi.spyOn(Date, 'now').mockReturnValue(t0 + 11 * 60_000);
    await expect(cached(k, 0, vi.fn().mockRejectedValue(new Error('down')))).rejects.toBeInstanceOf(
      UpstreamError,
    );
    vi.restoreAllMocks();
  });
});
