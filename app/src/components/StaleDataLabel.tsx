/**
 * "○분 전 정보" 라벨.
 *
 * 프록시가 stale-while-revalidate로 캐시된 응답을 줄 때 반드시 붙는다.
 * 이 라벨이 없으면 앱이 6시간 전 도착정보를 실시간인 척 말하게 된다 —
 * 3분 남았다고 해서 나갔는데 버스가 이미 간 상황. 사용자는 다시 안 온다.
 */
export function StaleDataLabel({ cachedAt, now = Date.now() }: { cachedAt: number; now?: number }) {
  const minutes = Math.max(0, Math.floor((now - cachedAt) / 60_000));
  const text = minutes < 1 ? '방금 전 정보' : `${minutes}분 전 정보`;
  return (
    <span className="stale-label" role="status">
      {text}
    </span>
  );
}
