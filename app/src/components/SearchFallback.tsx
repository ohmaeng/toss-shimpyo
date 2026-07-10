import { useEffect, useMemo, useState } from 'react';
import { DATA_BASE } from '../api/config';
import { fetchJsonWithRetry } from '../api/http';
import type { SggData, Stop } from '../domain/types';
import { SGG_INDEX } from '../data/sggIndex';
import { searchStops } from '../data/stops';
import { ErrorState } from './ErrorState';

/**
 * 위치 권한 거부 시의 폴백.
 *
 * persona-elderly 반영: "정류장명 검색"만 주면 안 된다.
 * 71세 사용자는 매일 타는 정류장의 **이름을 모른다** — 한 번도 본 적이 없기 때문이다.
 * 그래서 지역(시군구)을 먼저 고르고, 정류장 목록을 훑어볼 수 있게 한다.
 * 이름 검색은 알고 있는 사람을 위한 부가 수단이다.
 */
export function SearchFallback({
  onSelectStop,
  onRetryLocation,
}: {
  onSelectStop: (stop: Stop, all: readonly Stop[], dataDate: string) => void;
  onRetryLocation: () => void;
}) {
  const [sggCode, setSggCode] = useState<string>('');
  const [query, setQuery] = useState('');
  const [data, setData] = useState<SggData | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  /**
   * 재시도 트리거.
   *
   * `setSggCode(sggCode)`로는 재시도가 안 된다 — 같은 값이면 React가 리렌더를 건너뛰고
   * 이펙트가 재실행되지 않아 버튼이 죽는다. 값이 바뀌는 nonce가 필요하다.
   */
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    if (!sggCode) {
      setData(null);
      return;
    }
    let alive = true;
    setStatus('loading');
    void (async () => {
      try {
        const d = await fetchJsonWithRetry<SggData>(`${DATA_BASE}/stops/${sggCode}.json`, 1, {
          timeoutMs: 8_000,
        });
        if (!alive) return;
        setData(d);
        setStatus('idle');
      } catch {
        if (alive) setStatus('error');
      }
    })();
    return () => {
      alive = false;
    };
  }, [sggCode, retryNonce]);

  const visible = useMemo(() => {
    if (!data) return [];
    return query.trim() ? searchStops(query, data.stops) : data.stops.slice(0, 50);
  }, [data, query]);

  return (
    <div className="search-fallback">
      <div className="search-fallback__intro">
        <h2>어디에서 버스를 기다리세요?</h2>
        <p>위치 정보를 쓸 수 없어서, 지역을 직접 골라주세요.</p>
        <button type="button" className="btn btn--ghost" onClick={onRetryLocation}>
          위치 사용 다시 시도
        </button>
      </div>

      <label className="field">
        <span className="field__label">지역</span>
        <select className="field__input" value={sggCode} onChange={(e) => setSggCode(e.target.value)}>
          <option value="">지역을 선택하세요</option>
          {SGG_INDEX.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      {sggCode ? (
        <label className="field">
          <span className="field__label">정류장 이름 (모르면 비워두세요)</span>
          <input
            className="field__input"
            type="search"
            value={query}
            placeholder="예: 강남역"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      ) : null}

      {status === 'error' ? (
        <ErrorState title="정류장 목록을 불러오지 못했어요" onRetry={() => setRetryNonce((n) => n + 1)} />
      ) : null}

      {status === 'loading' ? <div className="skeleton skeleton--row" /> : null}

      {data && status === 'idle' ? (
        <ul className="stop-list">
          {visible.length === 0 ? (
            <li className="stop-list__empty">
              {query.trim() ? '이름이 일치하는 정류장이 없어요' : '이 지역에 정류장 데이터가 없어요'}
            </li>
          ) : (
            visible.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="stop-list__item"
                  onClick={() => onSelectStop(s, data.stops, data.dataDate)}
                >
                  {s.name}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
