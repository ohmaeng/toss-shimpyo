/**
 * 앱인토스 브릿지 래퍼.
 *
 * 실제 시그니처는 `@apps-in-toss/web-framework@2.10.5`의 타입 정의에서 확인했다.
 * (docs/확정-아키텍처-메모.md 참조)
 *
 * 토스 앱 밖(브라우저 dev 서버)에서는 브릿지가 없다. 그때는 웹 표준 API로 폴백해서
 * 개발·디버깅이 가능하게 한다. 폴백은 개발 편의일 뿐, 실기기 검증을 대체하지 않는다.
 */
import {
  Accuracy,
  getCurrentLocation as aitGetCurrentLocation,
  getNetworkStatus as aitGetNetworkStatus,
  openURL as aitOpenURL,
  Storage as AitStorage,
} from '@apps-in-toss/web-framework';
import type { LatLng } from '../domain/geo';

export type PermissionStatus = 'notDetermined' | 'denied' | 'allowed';
export type NetworkStatus = 'OFFLINE' | 'WIFI' | '2G' | '3G' | '4G' | '5G' | 'WWAN' | 'UNKNOWN';

/** 토스 앱 WebView 안에서 실행 중인가. 브릿지 호출 실패로 판정한다. */
let inTossCache: boolean | null = null;

async function inToss(): Promise<boolean> {
  if (inTossCache !== null) return inTossCache;
  try {
    await aitGetNetworkStatus();
    inTossCache = true;
  } catch {
    inTossCache = false;
  }
  return inTossCache;
}

export class LocationPermissionDeniedError extends Error {
  constructor() {
    super('위치 권한이 거부되었습니다');
    this.name = 'LocationPermissionDeniedError';
  }
}

export class LocationUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('위치를 가져오지 못했습니다', { cause });
    this.name = 'LocationUnavailableError';
  }
}

export async function getLocationPermission(): Promise<PermissionStatus> {
  if (!(await inToss())) {
    if (typeof navigator === 'undefined' || !('permissions' in navigator)) return 'notDetermined';
    try {
      const s = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      return s.state === 'granted' ? 'allowed' : s.state === 'denied' ? 'denied' : 'notDetermined';
    } catch {
      return 'notDetermined';
    }
  }
  return aitGetCurrentLocation.getPermission();
}

/** 권한 재요청 다이얼로그. [불변] 세션당 1회만 호출한다 — 호출 측(useLocation)이 보장. */
export async function openLocationPermissionDialog(): Promise<'allowed' | 'denied'> {
  if (!(await inToss())) return 'denied';
  return aitGetCurrentLocation.openPermissionDialog();
}

export async function getCurrentLocation(): Promise<LatLng> {
  if (!(await inToss())) {
    return new Promise((resolve, reject) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        reject(new LocationUnavailableError());
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        (e) =>
          reject(
            e.code === e.PERMISSION_DENIED
              ? new LocationPermissionDeniedError()
              : new LocationUnavailableError(e),
          ),
        { timeout: 8_000, maximumAge: 60_000 },
      );
    });
  }

  try {
    // Balanced = 오차범위 몇 백미터 이내. 정류장 반경 검색에는 이 정도면 충분하고,
    // High 이상은 배터리를 더 먹으면서 실내에서 오히려 느리다.
    const res = await aitGetCurrentLocation({ accuracy: Accuracy.Balanced });
    return { lat: res.coords.latitude, lng: res.coords.longitude };
  } catch (e) {
    const status = await getLocationPermission().catch(() => 'denied' as const);
    if (status === 'denied') throw new LocationPermissionDeniedError();
    throw new LocationUnavailableError(e);
  }
}

export async function getNetworkStatus(): Promise<NetworkStatus> {
  if (!(await inToss())) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'OFFLINE';
    return 'UNKNOWN';
  }
  try {
    return (await aitGetNetworkStatus()) as NetworkStatus;
  } catch {
    return 'UNKNOWN';
  }
}

export async function openExternalURL(url: string): Promise<void> {
  if (!(await inToss())) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  await aitOpenURL(url);
}

/** 즐겨찾기 영속화. 토스 밖에서는 localStorage. */
export const storage = {
  async getItem(key: string): Promise<string | null> {
    if (!(await inToss())) {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    }
    return AitStorage.getItem(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (!(await inToss())) {
      try {
        localStorage.setItem(key, value);
      } catch {
        /* 사파리 프라이빗 모드 등 — 즐겨찾기 실패가 앱을 죽이면 안 된다 */
      }
      return;
    }
    await AitStorage.setItem(key, value);
  },
  async removeItem(key: string): Promise<void> {
    if (!(await inToss())) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* 위와 동일 */
      }
      return;
    }
    await AitStorage.removeItem(key);
  },
};
