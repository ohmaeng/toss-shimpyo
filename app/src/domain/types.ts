import type { LatLng } from './geo';

/** 쉼터 운영시간. 데이터에 없으면 필드 자체가 null — 절대 기본값(09:00-18:00)을 채우지 않는다. */
export interface OperatingHours {
  /** "HH:MM" */
  readonly open: string;
  /** "HH:MM" */
  readonly close: string;
}

export interface Shelter {
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  /** 직선거리(m). 파이프라인에서 사전 계산. */
  readonly distanceM: number;
  /** 분속 60m 환산. 파이프라인에서 사전 계산. */
  readonly walkMin: number;
  /** 데이터에 운영시간 필드가 없으면 null → "운영시간 미확인" */
  readonly hours: OperatingHours | null;
}

export interface StopRoute {
  readonly routeId: string;
  /** 노선 번호 (예: "146") */
  readonly name: string;
  /**
   * 배차간격(분). 확인 불가한 노선은 null.
   * [불변] 4중 조건 #4에서 null이면 대안 제안 비활성화 — 추정값을 넣지 않는다.
   */
  readonly intervalMin: number | null;
}

export interface Stop {
  readonly id: string;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  /** TAGO 도착정보 API의 nodeId. 조인 실패 시 null. */
  readonly nodeId: string | null;
  /** TAGO cityCode. 조인 실패 시 null. */
  readonly cityCode: number | null;
  /**
   * 실시간 도착정보 제공 여부.
   * false여도 정류장을 버리지 않는다 — "이 지역은 실시간 도착정보가 제공되지 않아요"를 보여줘야 하므로.
   */
  readonly arrivalSupported: boolean;
  readonly routes: readonly StopRoute[];
  /**
   * 반경 300m 내 무더위쉼터. 파이프라인에서 사전 계산.
   * 빈 배열 = "찾아봤는데 없음"(absent). shelterSearched=false = "못 찾아봄"(unknown).
   */
  readonly shelters: readonly Shelter[];
  /** 파이프라인이 이 정류장에 대해 쉼터 반경 검색을 실제로 수행했는가. */
  readonly shelterSearched: boolean;
}

export interface SggData {
  /** 원천 데이터 기준일 "YYYY-MM". [불변] 없으면 3상태 원칙 위반. */
  readonly dataDate: string;
  readonly sggCode: string;
  readonly sggName: string;
  readonly stops: readonly Stop[];
}

export interface SggIndexEntry {
  readonly code: string;
  readonly name: string;
  readonly bbox: readonly [number, number, number, number];
}

export const stopCoord = (s: Stop): LatLng => ({ lat: s.lat, lng: s.lng });
