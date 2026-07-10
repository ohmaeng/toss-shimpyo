"""거리·도보시간 계산. app/src/domain/{geo,walking}.ts 와 반드시 동일한 값을 내야 한다."""
from __future__ import annotations

import math

EARTH_RADIUS_M = 6_371_008.8

# [불변] 분속 60m — 고령자 보수 기준. app/src/domain/walking.ts 와 동일.
WALK_SPEED_M_PER_MIN = 60
SHELTER_SEARCH_RADIUS_M = 300


def distance_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    h = (
        math.sin(d_lat / 2) ** 2
        + math.sin(d_lng / 2) ** 2 * math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
    )
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(h))


def walk_minutes(distance_m: float) -> int:
    """올림. 3.1분을 '3분'이라 말해 버스를 놓치게 하지 않는다."""
    return max(1, math.ceil(distance_m / WALK_SPEED_M_PER_MIN))


def is_plausible_korea_coord(lat: float, lng: float) -> bool:
    return 33.0 <= lat <= 39.0 and 124.0 <= lng <= 132.0
