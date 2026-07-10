import { useEffect, useState } from 'react';
import { getNetworkStatus, type NetworkStatus } from '../platform/bridge';

/** 오프라인 배너용. 브릿지가 없으면 navigator.onLine 으로 폴백한다. */
export function useNetwork(): { offline: boolean; status: NetworkStatus } {
  const [status, setStatus] = useState<NetworkStatus>('UNKNOWN');

  useEffect(() => {
    let alive = true;
    const check = async () => {
      const s = await getNetworkStatus();
      if (alive) setStatus(s);
    };
    void check();

    const onOnline = () => void check();
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOnline);
    const timer = window.setInterval(check, 15_000);

    return () => {
      alive = false;
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOnline);
      window.clearInterval(timer);
    };
  }, []);

  return { offline: status === 'OFFLINE', status };
}
