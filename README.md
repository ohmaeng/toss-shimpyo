# 쉼표 정류장 (shimpyo-station)

여름 버스 대기 지도 — "버스가 언제 오는지"에 "기다리는 동안 어디가 시원한지"를 얹었다.
토스 앱인토스 7월 바이브코딩 챌린지 출품작.

- 기획: [개발계획서.md](개발계획서.md)
- Phase 0 검증 결과: [docs/확정-아키텍처-메모.md](docs/확정-아키텍처-메모.md)
- 에이전트 운영: [docs/에이전트_운영계획.md](docs/에이전트_운영계획.md)

## 구조

```
app/        Apps in Toss WebView 미니앱 (React + TS + Vite)
pipeline/   빌드타임 데이터 파이프라인 (Python + pandas)
proxy/      서버리스 프록시 (Vercel Functions) — serviceKey 보호·캐싱·로깅
docs/       아키텍처 메모, 에이전트 운영계획
.claude/    프로젝트 전용 서브에이전트 17종
```

## 빠른 시작 (키 없이)

```bash
# 1) 목 데이터 생성 — 강남구·춘천시 8개 정류장, 모든 엣지케이스 포함
cd pipeline && python build_data.py --mock

# 2) 앱 실행 (프록시 없이 목 도착정보로 동작, 화면에 "목 데이터" 배지)
cd ../app && npm install && npm run dev
```

## 검증

```bash
cd app   && npm run typecheck && npm test && npm run build
cd proxy && npm run typecheck && npm test
```

현재 상태 (2026-07-10):

- 앱 **56 테스트** · 프록시 **6 테스트** 통과, 양쪽 타입체크 통과
- 번들 **62.1 KB gzip** (Leaflet 45 KB는 별도 청크 — 지도 폴백 ②에 도달할 때만 다운로드)
- 빌드 산출물에 API 키 유출 없음 (`dist/` grep 확인)
- App 스모크 렌더 통과 — 앱인토스 SDK import·최초 렌더·권한 거부 폴백까지 DOM에서 검증

**아직 안 된 것**: 실기기 WebView 검증(Phase 0 스파이크), 실데이터(현재 강남·춘천 예시 2개 시군구만).
자세한 내용은 [docs/리뷰-결과-2026-07-10.md](docs/리뷰-결과-2026-07-10.md).

## 실데이터로 전환

1. `app/.env.example` → `app/.env`, `proxy/.env.example` → `proxy/.env` 복사 후 채운다.
2. 프록시를 Vercel에 배포하고 `DATA_GO_KR_SERVICE_KEY`를 환경변수로 넣는다.
3. `app/.env`의 `VITE_PROXY_BASE`에 배포된 프록시 URL을 넣는다. **이 값이 채워지면 목 모드가 꺼진다.**
4. `pipeline/build_data.py`의 실데이터 경로를 완성한다(무더위쉼터 원천·nodeId 조인 검증 후).

## 지켜야 할 것 — [불변 규칙]

이 네 가지는 코드와 테스트에 박혀 있다. 바꾸려면 사람의 명시적 결정이 필요하다.

1. **3상태 정직 표기** — 있음(확인) / 없음(확인) / 미확인. 데이터의 부재와 사실의 부재를 섞지 않는다.
   `app/src/domain/threeState.ts`
2. **지도 폴백 체인 순서** — Kakao → Leaflet+타일 → 리스트 UI. 리스트 어댑터가 있는 한 앱은 지도 없이도 출시된다.
   `app/src/map/MapAdapter.ts`
3. **대안 정류장 4중 조건** — 하나라도 미충족·미확인이면 제안하지 않는다. 오제안이 무제안보다 나쁘다.
   `app/src/domain/altStop.ts`
4. **컷 규칙** — 배차간격 확보율이 20% 미만이면(또는 M2 잔여가 가용 기간의 절반을 넘으면) 대안 정류장 + 데이터셋 ⑤를 M4로 이월. `python pipeline/build_data.py --probe` 로 측정.
   `개발계획서.md` §7.3

## 비밀 관리

`serviceKey`는 **프록시 환경변수에만** 존재한다. 클라이언트 번들에 들어가면 안 된다.
`VITE_KAKAO_JS_KEY`는 JS 키라 노출이 정상이지만, Kakao 콘솔에서 도메인 제한을 걸어야 한다.
