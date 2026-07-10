import { PRIVACY_POLICY_URL } from '../api/config';
import { openExternalURL } from '../platform/bridge';

/**
 * 정보 시트 — 데이터 출처 표기 + 위치정보 이용 고지.
 *
 * 규정 항목이다. 장식이 아니다:
 *  - 공공데이터포털 이용 데이터는 **출처 표시 의무**가 있다(공공데이터법·이용약관).
 *  - 위치기반서비스는 위치정보 이용 목적을 사용자에게 고지해야 한다.
 *  - 지도 타일·SDK의 저작권 표기를 제거하면 약관 위반이다.
 *
 * 이게 없으면 콘솔 심사에서 리젝될 수 있다 — 기능이 아무리 좋아도.
 */
export function AboutSheet({ dataDate, onClose }: { dataDate: string; onClose: () => void }) {
  return (
    <div className="about" role="dialog" aria-label="앱 정보">
      <header className="about__header">
        <h2 className="about__title">쉼표 정류장 정보</h2>
        <button type="button" className="btn-icon" aria-label="닫기" onClick={onClose}>
          ✕
        </button>
      </header>

      <section className="about__section">
        <h3>위치정보 이용 안내</h3>
        <p>
          내 주변 정류장과 무더위쉼터를 찾기 위해서만 현재 위치를 사용해요. 위치 정보는 기기 밖으로 저장되지
          않고, 이용 통계에는 시·군·구 단위로만 남아요.
        </p>
      </section>

      <section className="about__section">
        <h3>데이터 출처</h3>
        <ul className="about__sources">
          <li>버스 정류장·노선 정보 — 국토교통부 TAGO (공공데이터포털)</li>
          <li>실시간 버스 도착정보 — 국토교통부 TAGO (공공데이터포털)</li>
          <li>무더위쉼터 — 행정안전부 (공공데이터포털)</li>
          <li>기온·폭염특보 — 기상청 (공공데이터포털)</li>
        </ul>
        {dataDate ? <p className="about__datadate">정류장·쉼터 데이터 기준 {dataDate.replace('-', '.')}</p> : null}
      </section>

      <section className="about__section">
        <h3>정보 표기 원칙</h3>
        <p>
          확인된 정보만 “있음”, 확인된 부재만 “없음”으로 적어요. 데이터로 확인하지 못한 것은 “미확인”이라고
          솔직하게 표시해요. 추측으로 채우지 않아요.
        </p>
      </section>

      {PRIVACY_POLICY_URL ? (
        <button type="button" className="btn btn--ghost" onClick={() => void openExternalURL(PRIVACY_POLICY_URL)}>
          개인정보 처리방침
        </button>
      ) : null}
    </div>
  );
}
