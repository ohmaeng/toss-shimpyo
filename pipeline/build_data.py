#!/usr/bin/env python3
"""
쉼표 정류장 — 빌드타임 데이터 파이프라인

  python build_data.py --mock            # 키 없이 목 데이터 생성 (앱 개발/데모용)
  python build_data.py --city-codes 23   # 실데이터 (DATA_GO_KR_SERVICE_KEY 필요)

산출물:
  app/src/data/sgg-index.json        번들 포함. 좌표 → 시군구 매핑용 bbox 테이블.
  app/public/data/stops/{code}.json  CDN 배포 대상. 시군구별 정류장 + 사전결합 쉼터.

원칙:
  - 결측을 추정으로 메우지 않는다. 운영시간이 없으면 null (앱에서 "미확인").
  - 조인 실패한 정류장을 버리지 않는다. arrivalSupported=false 로 남긴다.
  - 모든 JSON에 dataDate 를 박는다. 없으면 3상태 원칙 위반.
  - 멱등하다. 주 1회 재실행된다.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from geo import SHELTER_SEARCH_RADIUS_M, distance_meters, is_plausible_korea_coord, walk_minutes

ROOT = Path(__file__).resolve().parent.parent
INDEX_OUT = ROOT / "app" / "src" / "data" / "sgg-index.json"
STOPS_OUT_DIR = ROOT / "app" / "public" / "data" / "stops"


@dataclass
class Report:
    sgg_count: int = 0
    stop_count: int = 0
    shelter_count: int = 0
    dropped_bad_coord: int = 0
    join_failed: int = 0
    shelter_matched: int = 0
    interval_known: int = 0
    route_total: int = 0
    files: list[str] = field(default_factory=list)

    def print(self) -> None:
        print("\n=== 파이프라인 리포트 ===")
        print(f"시군구:               {self.sgg_count}")
        print(f"정류장:               {self.stop_count}")
        print(f"쉼터(결합된 건수):    {self.shelter_count}")
        print(f"좌표 이상치 제거:     {self.dropped_bad_coord}")
        pct = lambda n, d: f"{(100 * n / d):.1f}%" if d else "n/a"  # noqa: E731
        print(f"TAGO 조인 성공률:     {pct(self.stop_count - self.join_failed, self.stop_count)}"
              f"  (실패 {self.join_failed}건 → arrivalSupported=false)")
        print(f"쉼터 근접 매칭률:     {pct(self.shelter_matched, self.stop_count)}"
              f"  (반경 {SHELTER_SEARCH_RADIUS_M}m)")
        print(f"배차간격 확보율:      {pct(self.interval_known, self.route_total)}"
              f"  ← 낮으면 대안 정류장 제안이 거의 뜨지 않는다")
        print(f"산출 파일:            {len(self.files)}개")


def bbox_of(stops: list[dict[str, Any]]) -> list[float]:
    lats = [s["lat"] for s in stops]
    lngs = [s["lng"] for s in stops]
    # 소수점 3자리(≈100m)로 절삭 — 번들에 들어가는 인덱스이므로 크기에 민감하다.
    # 바깥으로 넉넉히 반올림해서 경계 정류장을 놓치지 않는다.
    return [
        round(min(lngs) - 0.001, 3),
        round(min(lats) - 0.001, 3),
        round(max(lngs) + 0.001, 3),
        round(max(lats) + 0.001, 3),
    ]


def join_shelters(stops: list[dict[str, Any]], shelters: list[dict[str, Any]]) -> int:
    """반경 300m 내 쉼터를 정류장에 사전 결합. 검색 수행 사실을 shelterSearched 로 남긴다."""
    matched = 0
    for s in stops:
        found = []
        for sh in shelters:
            d = distance_meters(s["lat"], s["lng"], sh["lat"], sh["lng"])
            if d <= SHELTER_SEARCH_RADIUS_M:
                found.append(
                    {
                        "name": sh["name"],
                        "lat": sh["lat"],
                        "lng": sh["lng"],
                        "distanceM": round(d),
                        "walkMin": walk_minutes(d),
                        # 원천에 운영시간이 없으면 null. 09:00-18:00 같은 기본값을 지어내지 않는다.
                        "hours": sh.get("hours"),
                    }
                )
        found.sort(key=lambda x: x["walkMin"])
        s["shelters"] = found
        s["shelterSearched"] = True  # 검색을 실제로 수행했다
        if found:
            matched += 1
    return matched


def validate_sgg(sgg: dict[str, Any], report: Report) -> dict[str, Any]:
    """좌표 이상치 제거, 통계 집계. 제거 건수는 반드시 리포트한다."""
    if not sgg.get("dataDate"):
        raise ValueError(f"{sgg['sggCode']}: dataDate 누락 — 3상태 원칙 위반")

    clean = []
    for s in sgg["stops"]:
        if not is_plausible_korea_coord(s["lat"], s["lng"]):
            report.dropped_bad_coord += 1
            continue
        if s.get("nodeId") is None or s.get("cityCode") is None:
            s["arrivalSupported"] = False
            report.join_failed += 1
        report.route_total += len(s["routes"])
        report.interval_known += sum(1 for r in s["routes"] if r.get("intervalMin") is not None)
        if s.get("shelterSearched") and s.get("shelters"):
            report.shelter_matched += 1
        report.shelter_count += len(s.get("shelters", []))
        clean.append(s)

    sgg["stops"] = clean
    report.stop_count += len(clean)
    return sgg


def write_outputs(sggs: list[dict[str, Any]], report: Report) -> None:
    STOPS_OUT_DIR.mkdir(parents=True, exist_ok=True)
    INDEX_OUT.parent.mkdir(parents=True, exist_ok=True)

    index = []
    for sgg in sggs:
        if not sgg["stops"]:
            print(f"  경고: {sgg['sggCode']} 정류장 0건 — 인덱스에서 제외", file=sys.stderr)
            continue
        path = STOPS_OUT_DIR / f"{sgg['sggCode']}.json"
        path.write_text(json.dumps(sgg, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        size_kb = path.stat().st_size / 1024
        report.files.append(f"{path.name} ({size_kb:.1f} KB)")
        if size_kb > 800:
            print(f"  경고: {path.name} 이 {size_kb:.0f} KB — 분할을 고려하라", file=sys.stderr)
        index.append({"code": sgg["sggCode"], "name": sgg["sggName"], "bbox": bbox_of(sgg["stops"])})
        report.sgg_count += 1

    INDEX_OUT.write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    idx_kb = INDEX_OUT.stat().st_size / 1024
    print(f"\n인덱스: {INDEX_OUT.relative_to(ROOT)} ({idx_kb:.1f} KB, 번들 포함)")
    if idx_kb > 60:
        print(f"  경고: 인덱스가 {idx_kb:.0f} KB — 번들 예산(200KB)을 잠식한다", file=sys.stderr)


def build_mock() -> list[dict[str, Any]]:
    import mock_fixtures

    return mock_fixtures.all_sgg()


def load_shelters_csv(path: Path) -> list[dict[str, Any]]:
    """
    무더위쉼터 CSV (공공데이터포털 행안부 데이터).

    컬럼명이 배포본마다 다르므로 후보를 넓게 잡는다.
    **운영시간 컬럼이 없으면 hours=None** — "09:00-18:00" 같은 기본값을 절대 지어내지 않는다.
    그 경우 앱은 전국 쉼터를 "운영시간 미확인"으로 표기한다. 그게 정직하다.
    """
    import pandas as pd

    df = pd.read_csv(path, encoding="utf-8-sig", dtype=str, keep_default_na=False)
    cols = {c.strip(): c for c in df.columns}

    def pick(*cands: str) -> str | None:
        for c in cands:
            if c in cols:
                return cols[c]
        return None

    c_name = pick("쉼터명칭", "시설명", "명칭", "restArea", "facility_name")
    c_lat = pick("위도", "lat", "latitude", "la")
    c_lng = pick("경도", "lon", "lng", "longitude", "lo")
    c_open = pick("평일운영시작시각", "운영시작시각", "start_time")
    c_close = pick("평일운영종료시각", "운영종료시각", "end_time")

    if not (c_name and c_lat and c_lng):
        raise SystemExit(f"쉼터 CSV에 이름/위도/경도 컬럼이 없다. 발견된 컬럼: {list(df.columns)[:15]}")
    if not (c_open and c_close):
        print("  경고: 쉼터 CSV에 운영시간 컬럼이 없다 → 전국 쉼터가 '운영시간 미확인'으로 표기된다", file=sys.stderr)

    def norm_time(v: str) -> str | None:
        v = (v or "").strip()
        if not v:
            return None
        # "0900" / "9:00" / "09:00" 모두 허용
        digits = v.replace(":", "")
        if digits.isdigit() and len(digits) in (3, 4):
            digits = digits.zfill(4)
            return f"{digits[:2]}:{digits[2:]}"
        return None

    out: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        try:
            lat, lng = float(row[c_lat]), float(row[c_lng])
        except (TypeError, ValueError):
            continue
        if not is_plausible_korea_coord(lat, lng):
            continue
        hours = None
        if c_open and c_close:
            o, c = norm_time(row[c_open]), norm_time(row[c_close])
            if o and c:
                hours = {"open": o, "close": c}
        out.append({"name": str(row[c_name]).strip(), "lat": lat, "lng": lng, "hours": hours})
    return out


def build_real(
    cities: list[tuple[int, str]],
    shelter_csv: Path | None,
    data_date: str,
    stops_only: bool,
) -> list[dict[str, Any]]:
    """
    실데이터 경로.

    stops_only=True 면 노선·배차간격 수집을 건너뛴다.
      - 노선 수집은 노선당 API 1회라, 전국(138개 도시)에서는 10만+ 호출이 되어 쿼터를 초과한다.
      - 노선 데이터의 유일한 소비처는 대안 정류장 4중 조건인데, 배차간격 확보율이 0%라
        그 기능은 현재 동작하지 않는다 (docs/검증-결과-2026-07-23.md §4).
      - 따라서 전국 빌드는 stops_only 로 한다: getSttnNoList 만 페이징 → 도시당 수 회 호출.

    아직 사람이 확인해야 하는 것:
      - 무더위쉼터 원천 CSV 경로 (--shelter-csv). 운영시간 컬럼 유무가 관건.
      - 정류장 위치 DB와 TAGO nodeId가 같은 체계인지 (여기서는 TAGO 정류소 API를 쓰므로 조인이 자명하다)
    """
    from sources import fetch_route_stops, fetch_routes, fetch_stops

    if shelter_csv is None:
        print("  경고: --shelter-csv 미지정 → 모든 정류장의 쉼터가 '미확인'이 된다", file=sys.stderr)
    shelters = load_shelters_csv(shelter_csv) if shelter_csv else []

    sggs: list[dict[str, Any]] = []
    for city, cityname in cities:
        label = f"{city} {cityname}".strip()
        print(f"[{label}] 정류장 수집...")
        res = fetch_stops(city)
        if res.dropped:
            print(f"[{label}] 좌표 결측으로 {res.dropped}건 제외")

        stop_routes: dict[str, list[dict[str, Any]]] = {}
        if stops_only:
            print(f"[{label}] 노선 수집 생략 (stops-only)")
        else:
            print(f"[{label}] 노선·배차간격 수집...")
            routes = fetch_routes(city)
            by_id = {r.route_id: r for r in routes}
            # 노선 → 경유 정류장. 4중 조건 #1(동일 노선 공유)의 입력.
            print(f"[{label}] 노선별 경유정류장 {len(routes)}개 조회 (시간이 걸린다)...")
            for i, r in enumerate(routes, 1):
                if i % 50 == 0:
                    print(f"  {i}/{len(routes)}")
                for node_id in fetch_route_stops(city, r.route_id):
                    stop_routes.setdefault(node_id, []).append(
                        {"routeId": r.route_id, "name": r.route_no, "intervalMin": by_id[r.route_id].interval_min}
                    )

        stops = [
            {
                "id": f"{city}-{s.node_id}",
                "name": s.name,
                "lat": s.lat,
                "lng": s.lng,
                "nodeId": s.node_id,
                "cityCode": city,
                # TAGO 정류소 API에서 온 nodeId이므로 도착정보 API와 같은 체계다.
                "arrivalSupported": True,
                "routes": stop_routes.get(s.node_id, []),
                "shelters": [],
                "shelterSearched": False,
            }
            for s in res.stops
        ]

        if shelters:
            matched = join_shelters(stops, shelters)
            print(f"[{label}] 쉼터 결합: {matched}/{len(stops)} 정류장")

        sggs.append(
            {"dataDate": data_date, "sggCode": str(city), "sggName": cityname or f"지역코드 {city}", "stops": stops}
        )
    return sggs


def probe(city_codes: list[int]) -> None:
    """
    쿼터를 거의 쓰지 않고 **배차간격 확보율**만 측정한다.

    이 숫자가 7/21 컷 판단의 근거다.
    낮으면 대안 정류장 제안(4중 조건 #4)은 코드는 있는데 화면에 뜨지 않는 유령 기능이다.
    그 경우 재논의 없이 M4로 이월한다 (개발계획서 §7.3).
    """
    from sources import fetch_routes

    print("=== 배차간격 확보율 측정 (--probe) ===")
    total = known = 0
    for city in city_codes:
        routes = fetch_routes(city)
        k = sum(1 for r in routes if r.interval_min is not None)
        total += len(routes)
        known += k
        pct = (100 * k / len(routes)) if routes else 0
        print(f"  지역 {city}: 노선 {len(routes)}개 중 배차간격 확인 {k}개 ({pct:.1f}%)")

    overall = (100 * known / total) if total else 0
    print(f"\n전체: {known}/{total} ({overall:.1f}%)")
    print("\n판정:")
    if overall < 20:
        print("  ❌ 대안 정류장 제안은 사실상 동작하지 않는다. 7/21을 기다리지 말고 지금 M4로 이월하라.")
    elif overall < 50:
        print("  ⚠ 대안 제안이 드물게만 뜬다. 차별점을 이 기능에 걸지 마라.")
    else:
        print("  ✅ 대안 제안이 의미 있게 동작할 수 있다.")


def _force_utf8_stdio() -> None:
    """Windows 콘솔 기본 인코딩(cp949)에서 한글·기호 출력이 깨진다."""
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")


def main() -> None:
    _force_utf8_stdio()
    ap = argparse.ArgumentParser(description="쉼표 정류장 데이터 파이프라인")
    ap.add_argument("--mock", action="store_true", help="키 없이 목 데이터 생성")
    ap.add_argument("--probe", action="store_true", help="배차간격 확보율만 측정 (7/21 컷 판단용)")
    ap.add_argument("--city-codes", type=str, default="", help="쉼표 구분 TAGO cityCode 목록")
    ap.add_argument("--all-cities", action="store_true", help="TAGO 전체 도시(전국) 자동 수집 (서울 제외 — TAGO 미커버)")
    ap.add_argument("--stops-only", action="store_true",
                    help="노선·배차간격 수집 생략. 전국 빌드는 쿼터상 이 옵션이 사실상 필수.")
    ap.add_argument("--shelter-csv", type=str, default="", help="무더위쉼터 CSV 경로")
    ap.add_argument("--data-date", type=str, default="", help="원천 데이터 기준일 YYYY-MM (필수, 실데이터)")
    args = ap.parse_args()

    report = Report()

    if args.mock:
        print("예시 데이터 모드 — 실데이터가 아니다. 앱 상단에 안내 배너가 표시된다.")
        sggs = build_mock()
        # 목 픽스처는 쉼터를 이미 결합해 두었으므로 재결합하지 않는다.
    else:
        if not os.environ.get("DATA_GO_KR_SERVICE_KEY"):
            raise SystemExit("DATA_GO_KR_SERVICE_KEY 가 없다. --mock 을 쓰거나 .env 를 설정하라.")

        # 도시 목록을 (code, name) 으로 해석한다.
        from sources import fetch_city_codes

        if args.all_cities:
            print("전국 도시코드 조회 중...")
            cities = fetch_city_codes()
            print(f"  TAGO 도시 {len(cities)}개 (서울은 TAGO에 없어 제외됨)")
        else:
            codes = [int(c) for c in args.city_codes.split(",") if c.strip()]
            if not codes:
                raise SystemExit("--city-codes 또는 --all-cities 를 지정하라 (예: --city-codes 23,25,32010)")
            name_map = dict(fetch_city_codes())
            cities = [(c, name_map.get(c, "")) for c in codes]
            unknown = [c for c, n in cities if not n]
            if unknown:
                print(f"  경고: TAGO에 없는 cityCode {unknown} — 0건이 나올 수 있다", file=sys.stderr)

        if args.probe:
            probe([c for c, _ in cities])
            return

        if not args.data_date:
            raise SystemExit("--data-date 가 없다 (예: --data-date 2026-07). dataDate 없이는 3상태 원칙을 지킬 수 없다.")
        if args.all_cities and not args.stops_only:
            print("  경고: --all-cities 인데 --stops-only 가 없다. 노선 수집은 노선당 1회 호출이라\n"
                  "        전국에서 쿼터를 크게 초과한다. --stops-only 사용을 강력히 권한다.", file=sys.stderr)
        csv = Path(args.shelter_csv) if args.shelter_csv else None
        sggs = build_real(cities, csv, args.data_date, args.stops_only)

    sggs = [validate_sgg(s, report) for s in sggs]
    write_outputs(sggs, report)
    report.print()


if __name__ == "__main__":
    main()
