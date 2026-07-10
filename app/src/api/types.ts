/**
 * [불변] 장애와 "데이터 없음"을 절대 섞지 않는다.
 *
 * API 실패 시 빈 배열을 반환해서 UI가 "도착 예정 버스 없음"으로 표시하는 것이
 * 이 앱에서 가능한 최악의 버그다. 타입 레벨에서 막는다 — `unavailable`에는 items 필드가 없다.
 */

export interface Arrival {
  readonly routeName: string;
  /** 도착까지 남은 초 */
  readonly arrivalSec: number;
  /** 남은 정류장 수. 미제공이면 null. */
  readonly prevStopCount: number | null;
}

export type ArrivalsResult =
  /** 정상 응답. items가 비어 있으면 "지금 오는 버스가 없다"는 확인된 사실이다. */
  | { readonly kind: 'ok'; readonly items: readonly Arrival[] }
  /** 원 API 장애/쿼터 소진 → 캐시된 마지막 응답. "○분 전 정보"로 표시한다. */
  | { readonly kind: 'stale'; readonly items: readonly Arrival[]; readonly cachedAt: number }
  /** 이 지역/노선은 TAGO가 실시간 도착정보를 제공하지 않는다. 장애가 아니다. */
  | { readonly kind: 'unsupported' }
  /** 장애. items가 없다 — 빈 배열조차 줄 수 없다. */
  | { readonly kind: 'unavailable'; readonly retryable: true };

export interface Weather {
  /** 기온(℃). 미제공이면 null. */
  readonly tempC: number | null;
  /** 폭염특보 발효 중인가. 판정 불가면 null → 배너를 숨긴다(오탐 방지). */
  readonly heatAlert: HeatAlert | null;
}

export interface HeatAlert {
  /** '폭염주의보' | '폭염경보' */
  readonly level: '폭염주의보' | '폭염경보';
  readonly areaName: string;
}

export type WeatherResult =
  | { readonly kind: 'ok'; readonly value: Weather }
  | { readonly kind: 'stale'; readonly value: Weather; readonly cachedAt: number }
  | { readonly kind: 'unavailable' };
