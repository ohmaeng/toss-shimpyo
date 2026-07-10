import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  // 콘솔 등록 정보와 반드시 일치해야 한다. deeplink: intoss://shimpyo-station
  appName: 'shimpyo-station',
  brand: {
    displayName: '쉼표 정류장',
    primaryColor: '#3182F6',
    icon: '',
  },
  // 위치 기반 앱이므로 geolocation 필수. 그 외 권한은 요구하지 않는다(심사 시 과다 권한 감점 방지).
  permissions: [{ name: 'geolocation', access: 'access' }],
  web: {
    host: 'localhost',
    port: 5173,
    commands: {
      dev: 'vite dev',
      build: 'vite build',
    },
  },
  outdir: 'dist',
});
