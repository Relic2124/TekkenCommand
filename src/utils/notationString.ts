import type { CommandItem, DirectionNotation, ButtonNotation } from '../types/index.js';

export type InputNotationMode = 'english' | 'korean';

/** 방향 → 한국(키패드) 표기 (7 8 9 / 4 n 6 / 1 2 3), 홀드는 숫자~ */
function directionToKorean(d: DirectionNotation): string {
  const tap: Record<string, string> = {
    db: '1', d: '2', df: '3', b: '4', n: 'n', f: '6', ub: '7', u: '8', uf: '9',
  };
  const hold: Record<string, string> = {
    dbhold: '1~', dhold: '2~', dfhold: '3~', bhold: '4~', fhold: '6~', ubhold: '7~', uhold: '8~', ufhold: '9~',
  };
  return hold[d] ?? tap[d] ?? d;
}

/** 버튼 → 한국 표기 LP, RP, LK, RK, AP, AK 및 조합 */
function buttonToKorean(b: ButtonNotation): string {
  const map: Record<string, string> = {
    '1': 'LP', '2': 'RP', '3': 'LK', '4': 'RK',
    '1+2': 'AP', '3+4': 'AK',
    '1+3': 'LP+LK', '1+4': 'LP+RK', '2+3': 'RP+LK', '2+4': 'RP+RK',
    '1+2+3': 'AP+LK', '1+2+4': 'AP+RK', '1+3+4': 'LP+AK', '2+3+4': 'RP+AK',
    '1+2+3+4': 'AP+AK',
  };
  return map[b] ?? b;
}

/**
 * 커맨드를 입력창 표기 문자열로 변환
 * @param mode 'english' = 영어권 표기(f,d/f,1+2), 'korean' = 키패드+LP/RP/AP/LK/RK/AK
 */
export function commandToNotationString(item: CommandItem, mode: InputNotationMode = 'english'): string {
  const useKeypadStyle = mode === 'korean';
  switch (item.type) {
    case 'direction': {
      if (useKeypadStyle) return directionToKorean(item.value);
      const d = item.value;
      if (d === 'n') return 'N';
      if (d === 'ub') return 'u/b';
      if (d === 'uf') return 'u/f';
      if (d === 'db') return 'd/b';
      if (d === 'df') return 'd/f';
      if (d === 'ubhold') return 'U/B';
      if (d === 'ufhold') return 'U/F';
      if (d === 'dbhold') return 'D/B';
      if (d === 'dfhold') return 'D/F';
      if (d === 'uhold') return 'U';
      if (d === 'dhold') return 'D';
      if (d === 'fhold') return 'F';
      if (d === 'bhold') return 'B';
      return d;
    }
    case 'button':
      return useKeypadStyle ? buttonToKorean(item.value) : item.value;
    case 'special':
      if (useKeypadStyle) {
        if (item.value === 'heat') return '히트 버스트';
        if (item.value === 'heatSmash') return '히트 스매시';
        return '레이지 아츠';
      }
      if (item.value === 'heat') return 'H.';
      if (item.value === 'heatSmash') return 'HS.';
      return 'R.';
    case 'text':
      return `"${item.value}"`;
    case 'notation':
      if (item.value === 'bracketl') return '[';
      if (item.value === 'bracketr') return ']';
      return ' ▶ ';
    default:
      return '';
  }
}
