import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2020',
    // 지도 어댑터는 동적 import로 분리한다. 리스트 폴백 시 Kakao/Leaflet 코드를 받지 않는다.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('leaflet')) return 'map-leaflet';
          return undefined;
        },
      },
    },
    // perf-budget-guard: 초과하면 빌드가 경고한다
    chunkSizeWarningLimit: 220,
  },
  test: {
    // 기본은 node(순수 로직). 렌더 테스트는 파일 상단 `@vitest-environment happy-dom` 으로 전환한다.
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
