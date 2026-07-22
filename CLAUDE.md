# CLAUDE.md — 쉼표 정류장 (전국판 / Toss)

## 이 프로젝트
춘천 해커톤 본선작 `쉼표 정류장`의 **앱 디자인·코드를 이어받아 전국으로 확장**하는 리포지토리. Toss 바이브코딩 제출 대상.

- **앱:** `app/` — Vite + React 19 + TS, Leaflet + OSM(무키), PWA 오프라인. 고령자용 시민앱 + 관리자 대시보드. **디자인은 이 앱 그대로 유지.**
- **데이터 방향:** 전국 정류장(국토부 현황 CSV) + 실시간 도착(TAGO API). 데모용 `app/public/data/stops.json` 은 현재 춘천 데이터.
- **참고 자산:** `pipeline/`(춘천 CSV→stops.json), `docs/`(춘천 기획) — 전국 확장 시 참고용, 그대로 재사용 아님.

## 계약(스키마)
- `app/src/types/stop.ts` — 정류장 데이터 계약. 전국 스키마로 확장할 때 이 타입을 기준으로 넓힐 것.

## 정직성 규칙 (춘천판에서 계승)
- 시설 **3상태**(있음/없음/미확인). 근거 없는 "없음" 금지, "현장 확인" 문구 금지.
- no(확인된 없음)와 unknown(미확인)을 같은 변수·순위 효과로 합치지 않는다.

## 비밀키
- TAGO 키는 `app/.env`(gitignore)에만. 커밋·채팅 금지.

## 자주 쓰는 명령
```bash
cd app && npm run dev        # 개발 서버
cd app && npm test           # 프론트 테스트(vitest)
cd app && npm run build      # 정적 빌드(PWA)
```
