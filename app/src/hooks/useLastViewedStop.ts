import { useEffect, useState } from 'react';
import { storage } from '../platform/bridge';

const KEY = 'shimpyo.lastViewed.v1';
/** 이보다 오래된 기록은 복원하지 않는다. 어제 정류장이 오늘 열리면 혼란스럽다. */
const MAX_AGE_MS = 30 * 60_000;

interface Stored {
  stopId: string;
  at: number;
}

/**
 * 마지막으로 본 정류장.
 *
 * persona-caregiver: 아기가 울어 앱을 닫았다가 다시 열면 처음 화면으로 돌아갔다.
 * 병원 앞 정류장은 오늘 한 번 오는 곳이라 즐겨찾기할 리 없다.
 * 즐겨찾기(매일 같은 정류장)만 기억하는 설계는 일회성 이동을 하는 사람을 배신한다.
 */
export function useLastViewedStop(currentStopId: string | null) {
  const [stopId, setStopId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const raw = await storage.getItem(KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Stored;
          if (typeof parsed?.stopId === 'string' && Date.now() - parsed.at < MAX_AGE_MS) {
            setStopId(parsed.stopId);
          }
        }
      } catch {
        /* 손상된 값은 무시 */
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (currentStopId === null) return;
    void storage.setItem(KEY, JSON.stringify({ stopId: currentStopId, at: Date.now() } satisfies Stored));
  }, [currentStopId]);

  return { stopId, loaded };
}
