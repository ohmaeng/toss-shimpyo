/**
 * 전 화면 공용 에러 상태.
 *
 * 에러 상태는 기능이다. 8월 심사 기간의 API 장애는 곧 리텐션 손실이고,
 * 흰 화면을 본 사용자는 다음 날 앱을 열지 않는다.
 *
 * 문구는 시스템 용어를 쓰지 않는다 — "일시적으로 불러올 수 없어요"이지 "500 Internal Error"가 아니다.
 */
export function ErrorState({
  title,
  description,
  onRetry,
  retryLabel = '다시 시도',
}: {
  title: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="error-state" role="alert">
      <p className="error-state__title">{title}</p>
      {description ? <p className="error-state__desc">{description}</p> : null}
      {onRetry ? (
        <button type="button" className="btn btn--primary" onClick={onRetry}>
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}
