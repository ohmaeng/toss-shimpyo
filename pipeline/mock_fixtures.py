"""
목 데이터 — 키 없이 앱을 끝까지 돌려보기 위한 픽스처.

무작위가 아니다. 각 엣지케이스가 화면에 실제로 나타나도록 의도적으로 구성했다:
  - 도착정보 미제공 정류장 (TAGO 조인 실패)
  - 쉼터 없음(확인)  vs  쉼터 미확인
  - 운영시간 있음 / 없음(미확인) / 운영시간 밖
  - 4중 조건을 모두 통과하는 대안 정류장 쌍 (강남 A → 강남 B)
  - 4중 조건 중 배차간격 미확인으로 탈락하는 쌍
"""
from __future__ import annotations

from typing import Any

DATA_DATE = "2026-06"

# 경도 1도 ≈ 88.3km (위도 37.5 기준). 미터를 경도 델타로.
def _e(lng: float, meters: float) -> float:
    return round(lng + meters / 88_300, 6)


def _stop(
    sid: str,
    name: str,
    lat: float,
    lng: float,
    routes: list[dict[str, Any]],
    shelters: list[dict[str, Any]],
    *,
    node_id: str | None = None,
    city_code: int | None = 23,
    shelter_searched: bool = True,
) -> dict[str, Any]:
    return {
        "id": sid,
        "name": name,
        "lat": lat,
        "lng": lng,
        "nodeId": node_id if node_id is not None else f"MOCK{sid}",
        "cityCode": city_code,
        "arrivalSupported": node_id is not False and city_code is not None,
        "routes": routes,
        "shelters": shelters,
        "shelterSearched": shelter_searched,
    }


def _route(rid: str, name: str, interval: int | None) -> dict[str, Any]:
    return {"routeId": rid, "name": name, "intervalMin": interval}


def _shelter(name: str, lat: float, lng: float, dist: int, walk: int, hours: dict | None) -> dict[str, Any]:
    return {"name": name, "lat": lat, "lng": lng, "distanceM": dist, "walkMin": walk, "hours": hours}


GANGNAM_LAT = 37.4979
GANGNAM_LNG = 127.0276


def gangnam() -> dict[str, Any]:
    r146 = _route("R146", "146", 20)
    r360 = _route("R360", "360", 12)
    r_unknown = _route("R999", "마을01", None)  # 배차간격 미확인

    stops = [
        # A: 쉼터가 멀다(8분). B와 146번을 공유하고 170m 떨어져 있다 → B가 대안으로 제안된다.
        _stop(
            "11680-0001",
            "강남역",
            GANGNAM_LAT,
            GANGNAM_LNG,
            [r146, r360],
            [_shelter("강남경로당", 37.5021, 127.0301, 480, 8, {"open": "09:00", "close": "18:00"})],
        ),
        # B: 쉼터가 가깝다(3분). 4중 조건 전부 통과 → A의 대안.
        _stop(
            "11680-0002",
            "강남역 12번출구",
            GANGNAM_LAT,
            _e(GANGNAM_LNG, 170),
            [r146],
            [_shelter("역삼동 주민센터", 37.4985, 127.0295, 160, 3, {"open": "09:00", "close": "21:00"})],
        ),
        # C: 쉼터는 가깝지만 배차간격 미확인 노선만 공유 → 조건 4로 탈락(제안 안 됨).
        _stop(
            "11680-0003",
            "역삼초등학교",
            GANGNAM_LAT,
            _e(GANGNAM_LNG, 120),
            [r_unknown],
            [_shelter("역삼푸른솔도서관", 37.4990, 127.0288, 120, 2, None)],  # 운영시간 미확인
        ),
        # D: 반경 300m 내 쉼터 없음 — 검색은 수행됨 → "없음(확인)"
        _stop(
            "11680-0004",
            "논현역",
            37.5110,
            127.0215,
            [r360],
            [],
        ),
        # E: TAGO 조인 실패 → 실시간 도착정보 미제공. 정류장은 지도에 남는다.
        _stop(
            "11680-0005",
            "봉은사역",
            37.5145,
            127.0600,
            [_route("R301", "301", 15)],
            [_shelter("삼성2동 경로당", 37.5150, 127.0610, 95, 2, {"open": "10:00", "close": "17:00"})],
            node_id=None,
            city_code=None,
        ),
        # F: 쉼터 검색이 수행되지 않음 → "미확인". 대안 판정에서 배제된다.
        _stop(
            "11680-0006",
            "선릉역",
            37.5044,
            127.0490,
            [r360],
            [],
            shelter_searched=False,
        ),
    ]
    # E는 nodeId=None이므로 arrivalSupported를 명시적으로 끈다
    stops[4]["nodeId"] = None
    stops[4]["arrivalSupported"] = False
    stops[4]["cityCode"] = None

    return {"dataDate": DATA_DATE, "sggCode": "11680", "sggName": "서울특별시 강남구", "stops": stops}


def chuncheon() -> dict[str, Any]:
    r1 = _route("C001", "1", 30)
    r2 = _route("C002", "9", None)
    stops = [
        _stop(
            "51110-0001",
            "춘천시외버스터미널",
            37.8747,
            127.7220,
            [r1, r2],
            [_shelter("온의동 경로당", 37.8752, 127.7231, 150, 3, {"open": "09:00", "close": "18:00"})],
            city_code=51,
        ),
        _stop(
            "51110-0002",
            "춘천역",
            37.8853,
            127.7180,
            [r1],
            [],
            city_code=51,
        ),
    ]
    return {"dataDate": DATA_DATE, "sggCode": "51110", "sggName": "강원특별자치도 춘천시", "stops": stops}


def all_sgg() -> list[dict[str, Any]]:
    return [gangnam(), chuncheon()]
