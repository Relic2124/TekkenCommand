import type { KeyMapping, DirectionNotation, ButtonNotation } from '../types/index.js';

/** 키 코드를 읽기 쉬운 이름으로 (KeyW → W, Numpad4 → Num 4) */
export function keyCodeToLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  if (code.startsWith('Arrow')) return code.slice(5) + ' 화살표';
  return code;
}

/** 키 코드 배열을 쉼표 구분 문자열로 */
export function keyCodesToLabel(codes: string[]): string {
  return codes.length ? codes.map(keyCodeToLabel).join(' + ') : '—';
}

/**
 * README 기준 기본 키 매핑
 * w-u, a-b, s-d, d-f
 * numpad 4-1, 5-2, 1-3, 2-4, 6-1+2, 3-3+4
 * heat burst: 2+3 or Numpad7, rage art: df+1+2 or Numpad9
 */
export const defaultKeyMapping: KeyMapping = {
  directions: {
    u: ['KeyW'],
    d: ['KeyS'],
    f: ['KeyD'],
    b: ['KeyA'],
    n: [],
  },
  buttons: {
    '1': ['Numpad4'],
    '2': ['Numpad5'],
    '3': ['Numpad1'],
    '4': ['Numpad2'],
    '1+2': ['Numpad6'],
    '1+3': [],
    '1+4': [],
    '2+3': [],
    '2+4': [],
    '3+4': ['Numpad3'],
    '1+2+3': [],
    '1+2+4': [],
    '1+3+4': [],
    '2+3+4': [],
    '1+2+3+4': [],
  },
  special: {
    heat: ['Numpad7'], // 2+3 동시도 나중에 처리
    rage: ['Numpad9'], // df+1+2 또는 넘패드9
  },
};

function setHasAll(set: Set<string>, keys: string[]): boolean {
  return keys.every((k) => set.has(k));
}

/** 대각선 = 위아래+앞뒤 조합. u+b→ub, u+f→uf, d+b→db, d+f→df */
function getDiagonalKeys(
  dirs: KeyMapping['directions']
): [DirectionNotation, string[]][] {
  return [
    ['ub', [...dirs.u, ...dirs.b]],
    ['uf', [...dirs.u, ...dirs.f]],
    ['db', [...dirs.d, ...dirs.b]],
    ['df', [...dirs.d, ...dirs.f]],
  ];
}

/** 눌린 키들로부터 현재 방향(대각선 우선) 반환 */
export function findDirectionFromKeys(
  pressedKeys: Set<string>,
  mapping: KeyMapping
): DirectionNotation | null {
  const dirs = mapping.directions;
  const diagonals = getDiagonalKeys(dirs);
  for (const [name, keys] of diagonals) {
    if (keys.length && setHasAll(pressedKeys, keys)) return name;
  }
  const singles: [DirectionNotation, string[]][] = [
    ['u', dirs.u],
    ['d', dirs.d],
    ['f', dirs.f],
    ['b', dirs.b],
  ];
  for (const [name, keys] of singles) {
    if (keys.length && setHasAll(pressedKeys, keys)) return name;
  }
  return null;
}

/** 눌린 키들로부터 눌린 버튼(1,2,3,4) 집합을 구한 뒤 조합 문자열로 반환 (동시 입력 = 1+2 형태) */
export function findButtonFromKeys(
  pressedKeys: Set<string>,
  mapping: KeyMapping
): ButtonNotation | null {
  const pressed = new Set<number>();

  // 단일 버튼: 해당 키가 모두 눌리면 그 버튼 포함
  for (const b of ['1', '2', '3', '4'] as const) {
    const codes = mapping.buttons[b];
    if (codes?.length && setHasAll(pressedKeys, codes)) pressed.add(parseInt(b, 10));
  }

  // 조합 전용 키(예: Numpad6=1+2, Numpad3=3+4): 해당 키가 눌리면 해당 버튼들 포함
  for (const [key, codes] of Object.entries(mapping.buttons)) {
    if (!codes?.length || key.length === 1) continue;
    if (!setHasAll(pressedKeys, codes)) continue;
    for (const part of key.split('+')) {
      const n = parseInt(part, 10);
      if (n >= 1 && n <= 4) pressed.add(n);
    }
  }

  if (pressed.size === 0) return null;
  const sorted = [...pressed].sort((a, b) => a - b);
  return sorted.join('+') as ButtonNotation;
}

/** 특수 커맨드: Numpad7=heat, Numpad9=rage 전용 (키 조합 제거로 1+2+3·f+2+3 등과 충돌 방지) */
export function findSpecialFromKeys(
  pressedKeys: Set<string>,
  mapping: KeyMapping
): 'heat' | 'rage' | null {
  if (mapping.special.heat.some((k) => pressedKeys.has(k))) return 'heat';
  if (mapping.special.rage.some((k) => pressedKeys.has(k))) return 'rage';
  return null;
}
