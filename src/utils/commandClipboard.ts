import type { CommandItem, DirectionNotation, ButtonNotation } from '../types/index.js';

const DIRECTION_TOKENS = new Set<string>([
  'u', 'd', 'f', 'b', 'n',
  'ub', 'uf', 'db', 'df',
  'uhold', 'dhold', 'fhold', 'bhold',
  'ubhold', 'ufhold', 'dbhold', 'dfhold',
]);

const BUTTON_TOKENS = new Set<string>([
  '1', '2', '3', '4',
  '1+2', '1+3', '1+4', '2+3', '2+4', '3+4',
  '1+2+3', '1+2+4', '1+3+4', '2+3+4', '1+2+3+4',
]);

/** 커맨드 배열을 클립보드용 텍스트로 직렬화 (영어 표기, 파싱 가능) */
export function commandsToCopyText(commands: CommandItem[]): string {
  return commands.map((item) => {
    switch (item.type) {
      case 'direction':
        return item.value;
      case 'button':
        return item.value;
      case 'special':
        return item.value;
      case 'notation':
        if (item.value === 'bracketl') return '[';
        if (item.value === 'bracketr') return ']';
        if (item.value === 'parenl') return '(';
        if (item.value === 'parenr') return ')';
        if (item.value === 'tilde') return '~';
        return 'next';
      case 'text':
        const escaped = (item.value as string).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        return `"${escaped}"`;
      default:
        return '';
    }
  }).filter(Boolean).join(' ');
}

type Token = { raw: string; quoted: boolean };

/** 토큰화: 공백으로 나누되, 쌍따옴표 안은 한 토큰 (이스케이프 \" 처리) */
function tokenize(str: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const trim = str.trim();
  while (i < trim.length) {
    while (i < trim.length && /\s/.test(trim[i])) i++;
    if (i >= trim.length) break;
    if (trim[i] === '"') {
      i++;
      let value = '';
      while (i < trim.length) {
        if (trim[i] === '\\' && trim[i + 1] === '"') {
          value += '"';
          i += 2;
        } else if (trim[i] === '\\' && trim[i + 1] === '\\') {
          value += '\\';
          i += 2;
        } else if (trim[i] === '"') {
          i++;
          break;
        } else {
          value += trim[i];
          i++;
        }
      }
      tokens.push({ raw: value, quoted: true });
    } else {
      let raw = '';
      while (i < trim.length && !/\s/.test(trim[i]) && trim[i] !== '"') {
        raw += trim[i];
        i++;
      }
      if (raw) tokens.push({ raw, quoted: false });
    }
  }
  return tokens;
}

/** 클립보드 텍스트를 파싱해 CommandItem[] 반환 */
export function parsePasteText(text: string): CommandItem[] {
  const tokens = tokenize(text);
  const result: CommandItem[] = [];
  for (const { raw, quoted } of tokens) {
    if (quoted) {
      result.push({ type: 'text', value: raw });
      continue;
    }
    if (raw === '[') {
      result.push({ type: 'notation', value: 'bracketl' });
      continue;
    }
    if (raw === ']') {
      result.push({ type: 'notation', value: 'bracketr' });
      continue;
    }
    if (raw === '(') {
      result.push({ type: 'notation', value: 'parenl' });
      continue;
    }
    if (raw === ')') {
      result.push({ type: 'notation', value: 'parenr' });
      continue;
    }
    if (raw === '~') {
      result.push({ type: 'notation', value: 'tilde' });
      continue;
    }
    if (raw === 'next' || raw === '▶') {
      result.push({ type: 'notation', value: 'next' });
      continue;
    }
    if (raw === 'heat' || raw === 'H.') {
      result.push({ type: 'special', value: 'heat' });
      continue;
    }
    if (raw === 'heatSmash' || raw === 'HS.') {
      result.push({ type: 'special', value: 'heatSmash' });
      continue;
    }
    if (raw === 'rage' || raw === 'R.') {
      result.push({ type: 'special', value: 'rage' });
      continue;
    }
    if (DIRECTION_TOKENS.has(raw)) {
      result.push({ type: 'direction', value: raw as DirectionNotation });
      continue;
    }
    if (BUTTON_TOKENS.has(raw)) {
      result.push({ type: 'button', value: raw as ButtonNotation });
      continue;
    }
  }
  return result;
}
