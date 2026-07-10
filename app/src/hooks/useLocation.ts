import { useCallback, useEffect, useRef, useState } from 'react';
import type { LatLng } from '../domain/geo';
import { track } from '../platform/analytics';
import {
  getCurrentLocation,
  getLocationPermission,
  LocationPermissionDeniedError,
  openLocationPermissionDialog,
} from '../platform/bridge';

export type LocationState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ok'; readonly coord: LatLng }
  /** 권한 거부 → 검색 폴백으로 간다. 에러가 아니다. */
  | { readonly kind: 'denied' }
  /** 권한은 있으나 위치를 못 얻음(실내, GPS 실패) → 재시도 가능 */
  | { readonly kind: 'unavailable' };

export function useLocation() {
  const [state, setState] = useState<LocationState>({ kind: 'loading' });
  /** [불변] 권한 재요청 안내는 세션당 1회. 반복 팝업은 고령 사용자를 앱에서 내쫓는다. */
  const dialogShown = useRef(false);

  const resolve = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const status = await getLocationPermission();

      if (status === 'denied') {
        // 이미 거부된 상태. 다이얼로그를 한 번만 열어본다.
        if (dialogShown.current) {
          track('location_permission_denied', { retried: true });
          setState({ kind: 'denied' });
          return;
        }
        dialogShown.current = true;
        const after = await openLocationPermissionDialog();
        if (after === 'denied') {
          track('location_permission_denied', { retried: false });
          setState({ kind: 'denied' });
          return;
        }
      }

      const coord = await getCurrentLocation();
      setState({ kind: 'ok', coord });
    } catch (e) {
      if (e instanceof LocationPermissionDeniedError) {
        track('location_permission_denied', { retried: dialogShown.current });
        setState({ kind: 'denied' });
        return;
      }
      setState({ kind: 'unavailable' });
    }
  }, []);

  useEffect(() => {
    void resolve();
  }, [resolve]);

  return { state, retry: resolve };
}
