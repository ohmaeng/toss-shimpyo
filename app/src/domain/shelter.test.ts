import { describe, expect, it } from 'vitest';
import { nearestShelter, shelterOpenState, shelterWalkMinState, sheltersState } from './shelter';
import type { Shelter, Stop } from './types';

const at = (h: number, m = 0) => new Date(2026, 6, 15, h, m);

const shelter = (over: Partial<Shelter> = {}): Shelter => ({
  name: '경로당',
  lat: 37.5,
  lng: 127.0,
  distanceM: 120,
  walkMin: 2,
  hours: null,
  ...over,
});

const stop = (over: Partial<Stop> = {}): Stop => ({
  id: 'A',
  name: 'A',
  lat: 37.5,
  lng: 127.0,
  nodeId: null,
  cityCode: null,
  arrivalSupported: true,
  routes: [],
  shelters: [],
  shelterSearched: true,
  ...over,
});

describe('shelterOpenState — 운영시간 3상태', () => {
  it('운영시간 필드가 없으면 unknown (기본값 09:00-18:00을 지어내지 않는다)', () => {
    expect(shelterOpenState(null, at(12))).toBe('unknown');
  });

  it('운영시간 내면 open', () => {
    expect(shelterOpenState({ open: '09:00', close: '18:00' }, at(12))).toBe('open');
  });

  it('운영시간 밖이면 closed', () => {
    expect(shelterOpenState({ open: '09:00', close: '18:00' }, at(20))).toBe('closed');
  });

  it('경계: close 시각은 closed (18:00에 닫는다)', () => {
    expect(shelterOpenState({ open: '09:00', close: '18:00' }, at(18))).toBe('closed');
  });

  it('경계: open 시각은 open', () => {
    expect(shelterOpenState({ open: '09:00', close: '18:00' }, at(9))).toBe('open');
  });

  it('자정을 넘기는 운영시간을 지원한다', () => {
    const h = { open: '22:00', close: '06:00' };
    expect(shelterOpenState(h, at(23))).toBe('open');
    expect(shelterOpenState(h, at(3))).toBe('open');
    expect(shelterOpenState(h, at(12))).toBe('closed');
  });

  it('형식이 깨진 시각은 unknown (파싱 실패를 closed로 반올림하지 않는다)', () => {
    expect(shelterOpenState({ open: '아침', close: '18:00' }, at(12))).toBe('unknown');
    expect(shelterOpenState({ open: '99:99', close: '18:00' }, at(12))).toBe('unknown');
  });
});

describe('sheltersState — 검색 수행 여부가 absent와 unknown을 가른다', () => {
  it('검색했고 결과가 있으면 present', () => {
    expect(sheltersState(stop({ shelters: [shelter()] })).state).toBe('present');
  });

  it('검색했는데 없으면 absent (없음-확인)', () => {
    expect(sheltersState(stop({ shelters: [], shelterSearched: true })).state).toBe('absent');
  });

  it('검색을 못 했으면 unknown — 빈 배열을 "없음"으로 읽지 않는다', () => {
    expect(sheltersState(stop({ shelters: [], shelterSearched: false })).state).toBe('unknown');
  });
});

describe('shelterWalkMinState', () => {
  it('가장 가까운 쉼터의 도보시간을 준다', () => {
    const s = stop({ shelters: [shelter({ walkMin: 5 }), shelter({ walkMin: 2 })] });
    expect(shelterWalkMinState(s)).toEqual({ state: 'present', value: 2 });
    expect(nearestShelter(s)?.walkMin).toBe(2);
  });

  it('미검색이면 unknown', () => {
    expect(shelterWalkMinState(stop({ shelterSearched: false })).state).toBe('unknown');
  });

  it('검색했으나 없으면 absent', () => {
    expect(shelterWalkMinState(stop({ shelters: [] })).state).toBe('absent');
  });
});
