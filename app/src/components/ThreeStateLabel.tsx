import type { ThreeStateLabel as Label } from '../domain/threeState';

/**
 * 3상태 라벨.
 *
 * [불변] 색만으로 정보를 전달하지 않는다 — text가 항상 함께 렌더된다.
 * 색각 이상 사용자와 눈이 침침한 고령 사용자 양쪽을 위한 것이다.
 */
export function ThreeStateLabel({ label }: { label: Label }) {
  return (
    <span className={`three-state three-state--${label.tone}`}>
      <span aria-hidden="true" className="three-state__dot" />
      {label.text}
    </span>
  );
}
