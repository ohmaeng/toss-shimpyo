/**
 * [불변 규칙] 3상태 정직 표기 원칙
 *
 * 데이터의 부재(absence of data)와 사실의 부재(data of absence)는 다르다.
 * 이 둘을 섞는 순간 앱이 거짓말을 한다.
 *
 * - present: 데이터로 존재가 확인됨      → "있음(확인)"
 * - absent:  데이터로 부재가 확인됨      → "없음(확인)"
 * - unknown: 데이터가 없거나 판단 불가   → "미확인"
 *
 * `absent`는 "찾아봤는데 없었다"일 때만 쓴다. "안 찾아봤다"는 `unknown`이다.
 */
export type ThreeState<T> =
  | { readonly state: 'present'; readonly value: T }
  | { readonly state: 'absent' }
  | { readonly state: 'unknown' };

export const present = <T>(value: T): ThreeState<T> => ({ state: 'present', value });
export const absent = <T>(): ThreeState<T> => ({ state: 'absent' });
export const unknown = <T>(): ThreeState<T> => ({ state: 'unknown' });

export const isPresent = <T>(s: ThreeState<T>): s is { state: 'present'; value: T } =>
  s.state === 'present';

/**
 * 값이 확인된 경우에만 값을 준다. 미확인/부재는 판정에서 배제된다.
 * 4중 조건 판정이 이 함수 위에 서 있다 — `?? 0` 같은 기본값 대입이 여기서 원천 차단된다.
 */
export const valueOrNull = <T>(s: ThreeState<T>): T | null => (isPresent(s) ? s.value : null);

/**
 * 검색을 수행했는지 여부로부터 3상태를 만든다.
 *
 * 파이프라인이 반경 검색을 수행했다면(searched=true) 결과 없음은 `absent`(없음-확인)다.
 * 검색 자체를 못 했다면 결과 없음은 `unknown`(미확인)이다.
 * 이 구분이 3상태 원칙의 전부다.
 */
export function fromSearch<T>(searched: boolean, results: readonly T[]): ThreeState<readonly T[]> {
  if (!searched) return unknown();
  if (results.length === 0) return absent();
  return present(results);
}

export type ThreeStateLabel = {
  readonly text: string;
  readonly tone: 'present' | 'absent' | 'unknown';
};

/**
 * 3상태를 사람이 읽는 라벨로. tone은 색을 고르는 데 쓰이지만,
 * 색만으로 정보를 전달하지 않기 위해 text는 항상 함께 렌더된다.
 *
 * persona-elderly 반영: "미확인" 같은 시스템 용어 대신 사람 말을 쓴다.
 */
export function labelOf<T>(
  s: ThreeState<T>,
  copy: { present: string; absent: string; unknown: string },
): ThreeStateLabel {
  switch (s.state) {
    case 'present':
      return { text: copy.present, tone: 'present' };
    case 'absent':
      return { text: copy.absent, tone: 'absent' };
    case 'unknown':
      return { text: copy.unknown, tone: 'unknown' };
  }
}
