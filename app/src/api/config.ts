/**
 * 프록시는 조건부가 아니라 필수다.
 *
 * 공공데이터포털 API는 serviceKey를 쿼리스트링으로 요구한다. 클라이언트에서 직접 호출하면
 * CORS 허용 여부와 무관하게 번들과 네트워크 탭에 키가 그대로 노출된다.
 * 따라서 직접 호출 경로는 아예 구현하지 않는다. (docs/확정-아키텍처-메모.md §3)
 */
export const PROXY_BASE: string = (import.meta.env.VITE_PROXY_BASE ?? '').replace(/\/$/, '');

/** 시군구 JSON이 호스팅된 CDN 베이스. 비어 있으면 앱 자체의 /data 를 쓴다(개발용). */
export const DATA_BASE: string = (import.meta.env.VITE_DATA_BASE ?? '/data').replace(/\/$/, '');

/**
 * 프록시가 없을 때(로컬 개발, 키 미발급 상태) 목 데이터를 쓴다.
 * 목 모드는 화면에 배지를 띄워서 실데이터로 착각하지 않게 한다 — 3상태 원칙의 연장이다.
 */
export const USE_MOCK: boolean = PROXY_BASE === '';

/** 제보 폼 URL. 미설정이면 제보 버튼을 숨긴다(죽은 버튼을 보여주지 않는다). */
export const REPORT_FORM_URL: string = import.meta.env.VITE_REPORT_FORM_URL ?? '';

/** 개인정보 처리방침 URL. 콘솔 심사 제출물 중 하나 — 없으면 링크를 숨긴다. */
export const PRIVACY_POLICY_URL: string = import.meta.env.VITE_PRIVACY_POLICY_URL ?? '';

/** 도착정보 폴링 주기(ms). 프록시 캐시 TTL(25s)과 맞춘다. */
export const ARRIVALS_POLL_MS = 30_000;
