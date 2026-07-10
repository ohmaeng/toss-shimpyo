import { distanceToBBoxMeters, inBBox, type BBox, type LatLng } from '../domain/geo';
import type { SggIndexEntry } from '../domain/types';
import rawIndex from './sgg-index.json';

/**
 * 시군구 bounding-box 인덱스.
 *
 * 이 파일만 번들에 포함된다. 전국 20만+ 정류장 데이터는 시군구별 원격 JSON이다.
 * 좌표는 소수점 3자리(약 100m)로 절삭되어 있다 — 번들 크기를 위해. bbox 판정에는 충분하다.
 */
export const SGG_INDEX: readonly SggIndexEntry[] = rawIndex as unknown as SggIndexEntry[];

/** bbox 경계에서 이 거리 안이면 인접 시군구도 함께 로드한다. 정류장이 경계 너머에 있을 수 있다. */
const BOUNDARY_MARGIN_M = 800;

/** 최대 로드 파일 수. 경계 3중점에서 무한정 늘어나는 것을 막는다. */
const MAX_SGG = 2;

/**
 * 현재 좌표에 해당하는 시군구를 찾는다.
 * bbox는 겹칠 수 있으므로(사각형 근사) 포함되는 것 전부 + 경계 근처를 거리순으로.
 */
export function findSggCandidates(coord: LatLng, limit: number = MAX_SGG): readonly SggIndexEntry[] {
  const scored = SGG_INDEX.map((e) => ({
    entry: e,
    inside: inBBox(coord, e.bbox as BBox),
    dist: distanceToBBoxMeters(coord, e.bbox as BBox),
  })).filter((s) => s.inside || s.dist <= BOUNDARY_MARGIN_M);

  scored.sort((a, b) => {
    if (a.inside !== b.inside) return a.inside ? -1 : 1;
    return a.dist - b.dist;
  });

  return scored.slice(0, limit).map((s) => s.entry);
}

export function findSggByCode(code: string): SggIndexEntry | null {
  return SGG_INDEX.find((e) => e.code === code) ?? null;
}
