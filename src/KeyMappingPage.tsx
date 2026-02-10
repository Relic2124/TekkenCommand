import { useCallback, useEffect, useState } from 'react';
import type { KeyMapping, NotationMappingKey } from './types/index.js';
import { defaultKeyMapping } from './utils/keyMapping.js';
import { keyCodeToLabel, keyCodesToLabel } from './utils/keyMapping.js';
import { getNotationImageUrl } from './utils/notationImages.js';

const STORAGE_KEY = 'tekken-key-mapping';

function loadSavedMapping(): KeyMapping | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as KeyMapping;
    if (parsed?.directions && parsed?.buttons && parsed?.special) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

export function saveKeyMapping(mapping: KeyMapping): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mapping));
  } catch {
    /* ignore */
  }
}

function ensureStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  return [];
}

export function loadKeyMapping(): KeyMapping {
  const saved = loadSavedMapping();
  if (!saved) return defaultKeyMapping;
  const directions = { ...defaultKeyMapping.directions };
  for (const k of Object.keys(directions) as (keyof typeof directions)[]) {
    if (saved.directions?.[k] != null) directions[k] = ensureStringArray(saved.directions[k]);
  }
  if (!directions.n?.length) directions.n = defaultKeyMapping.directions.n;
  for (const diag of ['ub', 'uf', 'db', 'df'] as const) {
    if (saved.directions?.[diag] != null) directions[diag] = ensureStringArray(saved.directions[diag]);
  }
  const buttons: Record<string, string[]> = { ...defaultKeyMapping.buttons };
  for (const k of Object.keys(buttons)) {
    if (saved.buttons?.[k] != null) buttons[k] = ensureStringArray(saved.buttons[k]);
  }
  for (const k of ADDITIONAL_ATTACK_BUTTON_KEYS) {
    if (saved.buttons?.[k] != null) buttons[k] = ensureStringArray(saved.buttons[k]);
  }
  const special = {
    heat: saved.special?.heat != null ? ensureStringArray(saved.special.heat) : defaultKeyMapping.special.heat,
    rage: saved.special?.rage != null ? ensureStringArray(saved.special.rage) : defaultKeyMapping.special.rage,
  };
  const notation: KeyMapping['notation'] = { ...defaultKeyMapping.notation };
  if (saved.notation && typeof saved.notation === 'object') {
    const keys: NotationMappingKey[] = ['next', 'bracketl', 'bracketr', 'parenl', 'parenr', 'tilde', 'linebreak'];
    for (const k of keys) {
      if (saved.notation![k] != null) notation[k] = ensureStringArray(saved.notation[k]);
    }
  }
  return { directions, buttons, special, notation };
}

type Theme = 'light' | 'dark';

type KeyMappingPageProps = {
  keyMapping: KeyMapping;
  onMappingChange: (mapping: KeyMapping) => void;
  onBack: () => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
};

/** 공격 버튼 표기(1,2,3,4) → 한국식(LP, RP, LK, RK) */
function buttonToKoreanLabel(cmd: string): string {
  const map: Record<string, string> = {
    '1': 'LP',
    '2': 'RP',
    '3': 'LK',
    '4': 'RK',
  };
  if (map[cmd]) return map[cmd];
  return cmd
    .split('+')
    .map((p) => map[p.trim()] ?? p)
    .join('+');
}

/** 공격 버튼: 표에 기본으로 보이는 것 */
const BASIC_ATTACK_BUTTON_KEYS = ['1', '2', '3', '4', '1+2', '3+4'] as const;

/** 공격 버튼: "추가 키 할당" 펼침 시 1+3부터 */
const ADDITIONAL_ATTACK_BUTTON_KEYS = [
  '1+3', '2+4', '1+4', '2+3',
  '1+2+3', '1+2+4', '1+3+4', '2+3+4',
  '1+2+3+4',
] as const;

const DIAGONAL_KEYS = ['ub', 'uf', 'db', 'df'] as const;
const SHOW_DIAGONAL_STORAGE_KEY = 'tekken-keymap-show-diagonal';
const SHOW_ADDITIONAL_BUTTONS_STORAGE_KEY = 'tekken-keymap-show-additional-buttons';

/** 노테이션 키가 비어 있을 때 표시할 기본 키 이름 */
const NOTATION_DEFAULT_DISPLAY: Record<NotationMappingKey, string> = {
  next: 'Space',
  bracketl: '[',
  bracketr: ']',
  parenl: '(',
  parenr: ')',
  tilde: '~',
  linebreak: '\\',
};

/** 매핑 전체에서 해당 키 코드를 제거한 새 KeyMapping 반환 */
function removeCodeFromMapping(mapping: KeyMapping, code: string): KeyMapping {
  const filter = (arr: string[]) => arr.filter((c) => c !== code);
  const directions = { ...mapping.directions } as KeyMapping['directions'];
  for (const k of Object.keys(directions) as (keyof typeof directions)[]) {
    directions[k] = filter(ensureStringArray(directions[k] ?? []));
  }
  const buttons: Record<string, string[]> = {};
  for (const k of Object.keys(mapping.buttons)) {
    buttons[k] = filter(ensureStringArray(mapping.buttons[k] ?? []));
  }
  const notation = mapping.notation ? { ...mapping.notation } : undefined;
  if (notation) {
    for (const k of Object.keys(notation) as (keyof typeof notation)[]) {
      if (Array.isArray(notation[k])) notation[k] = filter(notation[k] as string[]);
    }
  }
  return {
    directions,
    buttons,
    special: {
      heat: filter(mapping.special.heat),
      rage: filter(mapping.special.rage),
    },
    ...(notation ? { notation } : {}),
  };
}

/** 해당 키가 다른 슬롯에 할당돼 있는지 (현재 할당 대상 슬롯 제외) */
function isCodeUsedElsewhere(
  mapping: KeyMapping,
  code: string,
  current: ListeningSlot
): boolean {
  const hasCode = (arr: string[] | undefined) => Array.isArray(arr) && arr.includes(code);
  if (current.type === 'direction') {
    for (const [k, arr] of Object.entries(mapping.directions)) {
      if (k === current.key) continue;
      if (hasCode(arr)) return true;
    }
  }
  if (current.type === 'button') {
    for (const [k, arr] of Object.entries(mapping.buttons)) {
      if (k === current.key) continue;
      if (hasCode(arr)) return true;
    }
  }
  if (current.type === 'special') {
    if (current.key !== 'heat' && hasCode(mapping.special.heat)) return true;
    if (current.key !== 'rage' && hasCode(mapping.special.rage)) return true;
  }
  if (current.type !== 'direction') {
    for (const arr of Object.values(mapping.directions)) {
      if (hasCode(arr)) return true;
    }
  }
  if (current.type !== 'button') {
    for (const arr of Object.values(mapping.buttons)) {
      if (hasCode(arr)) return true;
    }
  }
  if (current.type !== 'special') {
    if (hasCode(mapping.special.heat) || hasCode(mapping.special.rage)) return true;
  }
  if (current.type === 'notation') {
    for (const [k, arr] of Object.entries(mapping.notation ?? {})) {
      if (k === current.key) continue;
      if (Array.isArray(arr) && hasCode(arr)) return true;
    }
  }
  if (current.type !== 'notation' && mapping.notation) {
    for (const arr of Object.values(mapping.notation)) {
      if (Array.isArray(arr) && hasCode(arr)) return true;
    }
  }
  return false;
}

type ListeningSlot =
  | { type: 'direction'; key: 'u' | 'd' | 'f' | 'b' | 'n' | 'ub' | 'uf' | 'db' | 'df' }
  | { type: 'button'; key: string }
  | { type: 'special'; key: 'heat' | 'rage' }
  | { type: 'notation'; key: NotationMappingKey };

const MODIFIER_CODES = new Set([
  'ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight',
  'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight',
]);

/** 슬롯 이동용으로만 예약: 매핑 불가 */
const FORBIDDEN_KEY_CODES = new Set(['Home', 'End']);
const FORBIDDEN_KEYS = new Set<string>();

/** 금지된 물리 키(e.code)에 대해 플래시에 보여줄 문자 */
const FORBIDDEN_CODE_DISPLAY: Record<string, string> = {};

function isListeningFor(listening: ListeningSlot | null, type: ListeningSlot['type'], key: string): boolean {
  if (!listening || listening.type !== type) return false;
  return listening.key === key;
}

function loadShowDiagonal(): boolean {
  try {
    return localStorage.getItem(SHOW_DIAGONAL_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function loadShowAdditionalButtons(): boolean {
  try {
    return localStorage.getItem(SHOW_ADDITIONAL_BUTTONS_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function KeyMappingPage({ keyMapping, onMappingChange, onBack, theme, onThemeChange }: KeyMappingPageProps) {
  const heatImgUrl = getNotationImageUrl('heat');
  const rageImgUrl = getNotationImageUrl('rage');
  const [listeningFor, setListeningFor] = useState<ListeningSlot | null>(null);
  const [forbiddenKeyFlash, setForbiddenKeyFlash] = useState<string | null>(null);
  const [showDiagonalSection, setShowDiagonalSection] = useState(loadShowDiagonal);
  const [showAdditionalButtons, setShowAdditionalButtons] = useState(loadShowAdditionalButtons);

  /** 대각선 표시용: 전용 키가 있으면 그대로, 없으면 위/아래+왼/오 조합 */
  const getDiagonalDisplayCodes = useCallback(
    (key: 'ub' | 'uf' | 'db' | 'df'): string[] => {
      const d = keyMapping.directions;
      const custom = d[key];
      if (custom?.length) return custom;
      const [a, b] =
        key === 'ub' ? [d.u, d.b] : key === 'uf' ? [d.u, d.f] : key === 'db' ? [d.d, d.b] : [d.d, d.f];
      return [...ensureStringArray(a), ...ensureStringArray(b)];
    },
    [keyMapping.directions]
  );

  const hasDiagonalOverride = useCallback(
    (key: 'ub' | 'uf' | 'db' | 'df'): boolean => (keyMapping.directions[key]?.length ?? 0) > 0,
    [keyMapping.directions]
  );

  const handleDiagonalToggle = () => {
    if (showDiagonalSection) {
      setShowDiagonalSection(false);
      try {
        localStorage.removeItem(SHOW_DIAGONAL_STORAGE_KEY);
      } catch {
        /* ignore */
      }
    } else {
      setShowDiagonalSection(true);
      try {
        localStorage.setItem(SHOW_DIAGONAL_STORAGE_KEY, '1');
      } catch {
        /* ignore */
      }
    }
  };

  const handleAdditionalButtonsToggle = () => {
    if (showAdditionalButtons) {
      setShowAdditionalButtons(false);
      try {
        localStorage.removeItem(SHOW_ADDITIONAL_BUTTONS_STORAGE_KEY);
      } catch {
        /* ignore */
      }
    } else {
      setShowAdditionalButtons(true);
      try {
        localStorage.setItem(SHOW_ADDITIONAL_BUTTONS_STORAGE_KEY, '1');
      } catch {
        /* ignore */
      }
    }
  };

  const clearDiagonalKey = useCallback(
    (key: 'ub' | 'uf' | 'db' | 'df') => {
      const next = {
        ...keyMapping,
        directions: { ...keyMapping.directions, [key]: [] },
      };
      onMappingChange(next);
      saveKeyMapping(next);
    },
    [keyMapping, onMappingChange]
  );

  const assignKey = useCallback(
    (code: string) => {
      if (!listeningFor) return;
      const keyLabel = keyCodeToLabel(code);
      if (isCodeUsedElsewhere(keyMapping, code, listeningFor)) {
        if (!window.confirm(`"${keyLabel}"에 이미 할당되어 있습니다. 설정하시겠습니까?`)) {
          setListeningFor(null);
          return;
        }
      }
      const cleared = removeCodeFromMapping(keyMapping, code);
      let next: KeyMapping;
      if (listeningFor.type === 'direction') {
        next = {
          ...cleared,
          directions: { ...cleared.directions, [listeningFor.key]: [code] },
        };
      } else if (listeningFor.type === 'button') {
        next = {
          ...cleared,
          buttons: { ...cleared.buttons, [listeningFor.key]: [code] },
        };
      } else if (listeningFor.type === 'notation') {
        next = {
          ...cleared,
          notation: { ...(cleared.notation ?? {}), [listeningFor.key]: [code] },
        };
      } else {
        next = {
          ...cleared,
          special: { ...cleared.special, [listeningFor.key]: [code] },
        };
      }
      onMappingChange(next);
      saveKeyMapping(next);
      setListeningFor(null);
      setForbiddenKeyFlash(null);
    },
    [listeningFor, keyMapping, onMappingChange]
  );

  useEffect(() => {
    if (!listeningFor) return;
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') {
        setListeningFor(null);
        setForbiddenKeyFlash(null);
        return;
      }
      if (MODIFIER_CODES.has(e.code)) return;
      if (FORBIDDEN_KEY_CODES.has(e.code) || FORBIDDEN_KEYS.has(e.key)) {
        const flashLabel = FORBIDDEN_KEYS.has(e.key)
          ? e.key
          : FORBIDDEN_CODE_DISPLAY[e.code] ?? keyCodeToLabel(e.code);
        setForbiddenKeyFlash(flashLabel);
        return;
      }
      setForbiddenKeyFlash(null);
      assignKey(e.code);
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [listeningFor, assignKey]);

  useEffect(() => {
    if (!forbiddenKeyFlash) return;
    const t = setTimeout(() => setForbiddenKeyFlash(null), 700);
    return () => clearTimeout(t);
  }, [forbiddenKeyFlash]);

  const handleReset = () => {
    onMappingChange(defaultKeyMapping);
    saveKeyMapping(defaultKeyMapping);
    setListeningFor(null);
    setForbiddenKeyFlash(null);
  };


  return (
    <div className="app keymap-page">
      <header className="header">
        <h1>키 매핑</h1>
        <nav className="page-nav">
          <button
            type="button"
            className="theme-toggle-btn"
            onClick={() => onThemeChange(theme === 'light' ? 'dark' : 'light')}
            title={theme === 'light' ? '라이트 테마로 전환' : '다크 테마로 전환'}
          >
            {theme === 'light' ? '☀️ 라이트' : '🌙 다크'}
          </button>
          <button type="button" className="nav-link" onClick={onBack}>
            ← 커맨드 생성기
          </button>
        </nav>
      </header>

      <div className="keymap-content">
        <div className="keymap-grid">
          <div className="keymap-grid-col">
        <section className="keymap-section">
          <h2>방향</h2>
          <table className="keymap-table">
            <thead>
              <tr>
                <th>커맨드</th>
                <th>키</th>
              </tr>
            </thead>
            <tbody>
              {(['u', 'd', 'f', 'b', 'n'] as const).map((key) => {
                const imgUrl = getNotationImageUrl(key);
                const listening = isListeningFor(listeningFor, 'direction', key);
                const codes = ensureStringArray(keyMapping.directions[key]);
                return (
                  <tr key={key}>
                    <td className="keymap-cmd-cell">
                      {imgUrl ? <img src={imgUrl} alt="" className="keymap-cmd-img" /> : null}
                    </td>
                    <td className="keymap-keys">
                      <button
                        type="button"
                        className="keymap-key-btn"
                        onClick={() => setListeningFor(listening ? null : { type: 'direction', key })}
                      >
                        {listening
                          ? (forbiddenKeyFlash ? <span className="keymap-forbidden-flash">{forbiddenKeyFlash}</span> : '키 입력 대기...')
                          : keyCodesToLabel(codes)}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {showDiagonalSection &&
                DIAGONAL_KEYS.map((key) => {
                  const imgUrl = getNotationImageUrl(key);
                  const listening = isListeningFor(listeningFor, 'direction', key);
                  const displayCodes = getDiagonalDisplayCodes(key);
                  const hasOverride = hasDiagonalOverride(key);
                  return (
                    <tr key={key}>
                      <td className="keymap-cmd-cell">
                        {imgUrl ? <img src={imgUrl} alt="" className="keymap-cmd-img" /> : null}
                      </td>
                      <td className="keymap-keys">
                        <span className="keymap-diagonal-key-cell">
                          <button
                            type="button"
                            className="keymap-key-btn"
                            onClick={() => setListeningFor(listening ? null : { type: 'direction', key })}
                          >
                            {listening
                            ? (forbiddenKeyFlash ? <span className="keymap-forbidden-flash">{forbiddenKeyFlash}</span> : '키 입력 대기...')
                            : keyCodesToLabel(displayCodes) || '—'}
                          </button>
                          {hasOverride && (
                            <button
                              type="button"
                              className="keymap-key-cancel-btn"
                              onClick={() => clearDiagonalKey(key)}
                            >
                              취소
                            </button>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
          <div className="keymap-diagonal-toggle-wrap">
            <button
              type="button"
              className="keymap-diagonal-toggle-btn"
              onClick={handleDiagonalToggle}
            >
              {showDiagonalSection ? '접기' : '대각선 할당'}
            </button>
          </div>
        </section>
          </div>
          <div className="keymap-grid-col">
        <section className="keymap-section">
          <h2>공격 버튼</h2>
          <table className="keymap-table">
            <thead>
              <tr>
                <th>커맨드</th>
                <th>키</th>
              </tr>
            </thead>
            <tbody>
              {BASIC_ATTACK_BUTTON_KEYS.map((cmd) => {
                const imgUrl = getNotationImageUrl(cmd);
                const codes = ensureStringArray(keyMapping.buttons[cmd] ?? []);
                const listening = isListeningFor(listeningFor, 'button', cmd);
                return (
                  <tr key={cmd}>
                    <td className="keymap-cmd-cell">
                      {imgUrl ? <img src={imgUrl} alt="" className="keymap-cmd-img" /> : null}
                      <span>{buttonToKoreanLabel(cmd)}</span>
                    </td>
                    <td className="keymap-keys">
                      <button
                        type="button"
                        className="keymap-key-btn"
                        onClick={() => setListeningFor(listening ? null : { type: 'button', key: cmd })}
                      >
                        {listening
                          ? (forbiddenKeyFlash ? <span className="keymap-forbidden-flash">{forbiddenKeyFlash}</span> : '키 입력 대기...')
                          : keyCodesToLabel(codes)}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {showAdditionalButtons &&
                ADDITIONAL_ATTACK_BUTTON_KEYS.map((cmd) => {
                  const imgUrl = getNotationImageUrl(cmd);
                  const codes = ensureStringArray(keyMapping.buttons[cmd] ?? []);
                  const listening = isListeningFor(listeningFor, 'button', cmd);
                  return (
                    <tr key={cmd}>
                      <td className="keymap-cmd-cell">
                        {imgUrl ? <img src={imgUrl} alt="" className="keymap-cmd-img" /> : null}
                        <span>{buttonToKoreanLabel(cmd)}</span>
                      </td>
                      <td className="keymap-keys">
                        <button
                          type="button"
                          className="keymap-key-btn"
                          onClick={() => setListeningFor(listening ? null : { type: 'button', key: cmd })}
                        >
{listening
                        ? (forbiddenKeyFlash ? <span className="keymap-forbidden-flash">{forbiddenKeyFlash}</span> : '키 입력 대기...')
                        : keyCodesToLabel(codes)}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="keymap-diagonal-toggle-wrap">
            <button
              type="button"
              className="keymap-diagonal-toggle-btn"
              onClick={handleAdditionalButtonsToggle}
            >
              {showAdditionalButtons ? '접기' : '추가 키 할당'}
            </button>
          </div>
        </section>
          </div>
        </div>

        <section className="keymap-section">
          <h2>특수</h2>
          <table className="keymap-table">
            <thead>
              <tr>
                <th>커맨드</th>
                <th>키</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="keymap-cmd-cell">
                  {heatImgUrl ? <img src={heatImgUrl} alt="" className="keymap-cmd-img" /> : null}
                  <span>히트 버스트/히트 스매시</span>
                </td>
                <td className="keymap-keys">
                  <button
                    type="button"
                    className="keymap-key-btn"
                    onClick={() =>
                      setListeningFor(
                        isListeningFor(listeningFor, 'special', 'heat') ? null : { type: 'special', key: 'heat' }
                      )
                    }
                  >
                    {isListeningFor(listeningFor, 'special', 'heat')
                      ? forbiddenKeyFlash
                        ? <span className="keymap-forbidden-flash">{forbiddenKeyFlash}</span>
                        : '키 입력 대기...'
                      : keyCodesToLabel(ensureStringArray(keyMapping.special.heat))}
                  </button>
                </td>
              </tr>
              <tr>
                <td className="keymap-cmd-cell">
                  {rageImgUrl ? <img src={rageImgUrl} alt="" className="keymap-cmd-img" /> : null}
                  <span>레이지 아츠</span>
                </td>
                <td className="keymap-keys">
                  <button
                    type="button"
                    className="keymap-key-btn"
                    onClick={() =>
                      setListeningFor(
                        isListeningFor(listeningFor, 'special', 'rage') ? null : { type: 'special', key: 'rage' }
                      )
                    }
                  >
                    {isListeningFor(listeningFor, 'special', 'rage')
                      ? forbiddenKeyFlash
                        ? <span className="keymap-forbidden-flash">{forbiddenKeyFlash}</span>
                        : '키 입력 대기...'
                      : keyCodesToLabel(ensureStringArray(keyMapping.special.rage))}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>

          <h3 style={{ marginTop: '1rem', marginBottom: '0.25rem', fontSize: '0.95rem' }}>노테이션 입력</h3>
          <p style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
            ▶, [ ], ( ), ~, 줄바꿈(↵) 등 표기 입력에 쓸 키를 바꿀 수 있습니다. 비어 있으면 아래 표시된 기본 키로 동작합니다.
          </p>
          <table className="keymap-table">
            <thead>
              <tr>
                <th>표기</th>
                <th>키</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  { key: 'next' as const, label: '▶ (next)' },
                  { key: 'bracketl' as const, label: '[' },
                  { key: 'bracketr' as const, label: ']' },
                  { key: 'parenl' as const, label: '(' },
                  { key: 'parenr' as const, label: ')' },
                  { key: 'tilde' as const, label: '~' },
                  { key: 'linebreak' as const, label: '↵ (줄바꿈)' },
                ] as const
              ).map(({ key, label }) => {
                const listening = isListeningFor(listeningFor, 'notation', key);
                const codes = ensureStringArray(keyMapping.notation?.[key] ?? []);
                const display = codes.length ? keyCodesToLabel(codes) : NOTATION_DEFAULT_DISPLAY[key];
                return (
                  <tr key={key}>
                    <td className="keymap-cmd-cell">
                      <span>{label}</span>
                    </td>
                    <td className="keymap-keys">
                      <button
                        type="button"
                        className="keymap-key-btn"
                        onClick={() =>
                          setListeningFor(listening ? null : { type: 'notation', key })
                        }
                      >
                        {listening
                          ? forbiddenKeyFlash
                            ? <span className="keymap-forbidden-flash">{forbiddenKeyFlash}</span>
                            : '키 입력 대기...'
                          : display}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

        </section>

        <div className="keymap-actions">
          <button type="button" className="keymap-reset-btn" onClick={handleReset}>
            기본값으로 초기화
          </button>
        </div>
      </div>
    </div>
  );
}
