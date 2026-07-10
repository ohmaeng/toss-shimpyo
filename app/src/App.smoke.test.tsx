// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

/**
 * 스모크 테스트 — 앱이 실제로 마운트되는가.
 *
 * 이것이 잡는 것: 앱인토스 SDK를 모듈 최상단에서 import할 때의 크래시,
 * 렌더 사이클의 예외, 첫 화면에 여름 신호가 실제로 존재하는지.
 *
 * 이것이 잡지 못하는 것: 실기기 WebView 동작, 지도 SDK, 실제 브릿지 호출.
 * 실기기 검증을 대체하지 않는다.
 */

afterEach(cleanup);

describe('App 스모크', () => {
  it('SDK import와 최초 렌더가 크래시 없이 끝난다', () => {
    expect(() => render(<App />)).not.toThrow();
  });

  it('첫 화면에 워드마크와 여름 태그라인이 있다 (테마 적합성 — 특보가 없어도)', async () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: '쉼표 정류장' })).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText(/시원한/)).toBeTruthy();
    });
  });

  it('목 모드에서 예시 데이터 안내가 뜬다 (실데이터로 착각 방지)', () => {
    render(<App />);
    expect(screen.getByText(/예시 데이터예요/)).toBeTruthy();
  });

  it('데이터 출처·위치정보 안내로 가는 상시 진입점이 있다 (규정 항목)', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /데이터 출처/ })).toBeTruthy();
  });

  it('위치 권한이 거부되면 크래시 대신 지역 선택 폴백이 뜬다', async () => {
    // 브릿지가 없는 환경(=토스 밖)이므로 navigator.geolocation 경로를 탄다.
    vi.stubGlobal('navigator', {
      ...globalThis.navigator,
      geolocation: {
        getCurrentPosition: (_ok: unknown, err: (e: { code: number; PERMISSION_DENIED: number }) => void) =>
          err({ code: 1, PERMISSION_DENIED: 1 }),
      },
    });

    render(<App />);
    await waitFor(
      () => {
        expect(screen.getByText(/지역을 직접 골라주세요/)).toBeTruthy();
      },
      { timeout: 4_000 },
    );
    vi.unstubAllGlobals();
  });
});
