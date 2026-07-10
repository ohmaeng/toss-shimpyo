import { describe, expect, it } from 'vitest';
import { findSggByCode, findSggCandidates, SGG_INDEX } from './sggIndex';

/** 파이프라인이 실제로 생성한 인덱스로 검증한다. 픽스처를 새로 만들지 않는다. */
describe('sggIndex — 좌표에서 시군구 찾기', () => {
  it('파이프라인이 생성한 인덱스가 로드된다', () => {
    expect(SGG_INDEX.length).toBeGreaterThan(0);
    for (const e of SGG_INDEX) {
      expect(e.bbox).toHaveLength(4);
      expect(e.code).toMatch(/^\d+$/);
    }
  });

  it('강남 좌표는 강남구를 찾는다', () => {
    const found = findSggCandidates({ lat: 37.4979, lng: 127.0276 });
    expect(found[0]?.code).toBe('11680');
  });

  it('춘천 좌표는 춘천시를 찾는다', () => {
    const found = findSggCandidates({ lat: 37.8747, lng: 127.722 });
    expect(found[0]?.code).toBe('51110');
  });

  it('최대 2개까지만 로드한다 — 경계 3중점에서 무한정 늘어나지 않는다', () => {
    const found = findSggCandidates({ lat: 37.4979, lng: 127.0276 });
    expect(found.length).toBeLessThanOrEqual(2);
  });

  it('대한민국 밖(제주 남쪽 바다)이면 후보가 없다 — 에러가 아니라 빈 결과', () => {
    expect(findSggCandidates({ lat: 30.0, lng: 125.0 })).toHaveLength(0);
  });

  it('데이터가 없는 지역(부산)은 후보가 없다 — 없는 데이터를 지어내지 않는다', () => {
    expect(findSggCandidates({ lat: 35.1796, lng: 129.0756 })).toHaveLength(0);
  });

  it('findSggByCode 는 없는 코드에 null', () => {
    expect(findSggByCode('99999')).toBeNull();
    expect(findSggByCode('11680')?.name).toContain('강남');
  });
});
