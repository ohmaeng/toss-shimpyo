"""
공공데이터포털 원천 데이터 수집.

주의: 서비스명·오퍼레이션명은 포털 문서를 보고 검증할 것. 아래 상수는 확인이 필요하다.
키가 없으면 이 모듈은 동작하지 않는다 — 그럴 때 build_data.py --mock 을 쓴다.

레이트리밋과 재시도를 넣었다. 이 파이프라인은 8월에 주 1회 재실행된다.
"""
from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Any, Iterator

import requests

PORTAL_BASE = "https://apis.data.go.kr"

# 오퍼레이션명은 2026-07-23 실 API 호출로 검증 완료 (docs/검증-결과-2026-07-23.md §3).
# 이 4개는 모두 200/정상. 도착정보(proxy)의 ...ArvlPrarng 오타와 달리 여기는 오타가 없었다.
CITY_CODE_URL = f"{PORTAL_BASE}/1613000/BusSttnInfoInqireService/getCtyCodeList"
STOP_INFO_URL = f"{PORTAL_BASE}/1613000/BusSttnInfoInqireService/getSttnNoList"
ROUTE_INFO_URL = f"{PORTAL_BASE}/1613000/BusRouteInfoInqireService/getRouteAcctoThrghSttnList"
ROUTE_LIST_URL = f"{PORTAL_BASE}/1613000/BusRouteInfoInqireService/getRouteNoList"

RATE_LIMIT_SEC = 0.12
MAX_RETRIES = 3


class MissingKeyError(RuntimeError):
    pass


def service_key() -> str:
    key = os.environ.get("DATA_GO_KR_SERVICE_KEY", "").strip()
    if not key:
        raise MissingKeyError(
            "DATA_GO_KR_SERVICE_KEY 가 없습니다. .env 를 설정하거나 --mock 으로 실행하세요."
        )
    return key


def _get(url: str, params: dict[str, Any]) -> dict[str, Any]:
    last: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            res = requests.get(url, params=params, timeout=15)
            res.raise_for_status()
            time.sleep(RATE_LIMIT_SEC)
            return res.json()
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"요청 실패: {url}") from last


def paged(url: str, params: dict[str, Any], num_of_rows: int = 1000) -> Iterator[dict[str, Any]]:
    """공공데이터포털 공통 페이징. items가 dict 하나로 오는 경우(단건)도 처리한다."""
    page = 1
    while True:
        body = _get(
            url,
            {**params, "serviceKey": service_key(), "_type": "json", "numOfRows": num_of_rows, "pageNo": page},
        )
        response = body.get("response", {})
        b = response.get("body", {}) or {}
        items = (b.get("items") or {}).get("item")
        if items is None:
            return
        if isinstance(items, dict):
            items = [items]
        yield from items

        total = int(b.get("totalCount") or 0)
        if page * num_of_rows >= total:
            return
        page += 1


def fetch_city_codes() -> list[tuple[int, str]]:
    """TAGO 전체 도시코드 (code, name). --all-cities 의 입력. 서울은 TAGO에 없다."""
    out: list[tuple[int, str]] = []
    for it in paged(CITY_CODE_URL, {}):
        code = it.get("citycode")
        if code is None:
            continue
        out.append((int(code), str(it.get("cityname", "")).strip()))
    return out


@dataclass(frozen=True)
class RawStop:
    node_id: str
    city_code: int
    name: str
    lat: float
    lng: float


@dataclass(frozen=True)
class RawRoute:
    route_id: str
    route_no: str
    # 배차간격(분). 확인 불가하면 None — [불변] 추정값을 넣지 않는다.
    interval_min: int | None


@dataclass(frozen=True)
class FetchStopsResult:
    stops: list[RawStop]
    # 좌표 결측/이상으로 버려진 행 수. 삭제 건수를 유실하지 않는다.
    dropped: int


def fetch_stops(city_code: int) -> FetchStopsResult:
    out: list[RawStop] = []
    dropped = 0
    for it in paged(STOP_INFO_URL, {"cityCode": city_code}):
        try:
            lat = float(it["gpslati"])
            lng = float(it["gpslong"])
        except (KeyError, TypeError, ValueError):
            dropped += 1  # 좌표 없는 정류장은 마커·근접검색이 불가하다
            continue
        out.append(
            RawStop(
                node_id=str(it["nodeid"]),
                city_code=city_code,
                name=str(it.get("nodenm", "")).strip(),
                lat=lat,
                lng=lng,
            )
        )
    return FetchStopsResult(stops=out, dropped=dropped)


# 배차간격이 담길 수 있는 필드명 후보.
# TAGO 노선정보 응답의 필드명은 서비스·지역별로 편차가 있다.
# 어느 것도 없으면 None — 평균값으로 메우지 않는다. 그러면 대안 제안이 비활성화된다(조건 4).
_INTERVAL_FIELDS = ("intervaltime", "intervalTime", "intervalsattime", "intervalsuntime")


def _parse_interval(item: dict[str, Any]) -> int | None:
    for f in _INTERVAL_FIELDS:
        v = item.get(f)
        if v in (None, "", "-"):
            continue
        try:
            n = int(float(str(v).strip()))
        except (TypeError, ValueError):
            continue
        # 0분·음수·6시간 초과는 데이터 오류로 본다. 판정에 쓰면 위험하다.
        if 1 <= n <= 360:
            return n
    return None


def fetch_routes(city_code: int) -> list[RawRoute]:
    """
    노선 목록 + 배차간격.

    배차간격은 대안 정류장 4중 조건 #4의 유일한 입력이다.
    확보율이 낮으면 그 기능은 화면에 뜨지 않는다 — build_data.py 리포트가 이 비율을 출력한다.
    """
    out: list[RawRoute] = []
    for it in paged(ROUTE_LIST_URL, {"cityCode": city_code}):
        rid = it.get("routeid")
        if not rid:
            continue
        out.append(
            RawRoute(
                route_id=str(rid),
                route_no=str(it.get("routeno", "")).strip(),
                interval_min=_parse_interval(it),
            )
        )
    return out


def fetch_route_stops(city_code: int, route_id: str) -> list[str]:
    """이 노선이 경유하는 정류장 nodeId 목록. 4중 조건 #1(동일 노선 공유)의 입력이다."""
    node_ids: list[str] = []
    for it in paged(ROUTE_INFO_URL, {"cityCode": city_code, "routeId": route_id}):
        nid = it.get("nodeid")
        if nid:
            node_ids.append(str(nid))
    return node_ids
