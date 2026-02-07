import type { KeyMapping } from './types/index.js';
import { defaultKeyMapping } from './utils/keyMapping.js';
import { keyCodesToLabel } from './utils/keyMapping.js';

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
  const buttons: Record<string, string[]> = { ...defaultKeyMapping.buttons };
  for (const k of Object.keys(buttons)) {
    if (saved.buttons?.[k] != null) buttons[k] = ensureStringArray(saved.buttons[k]);
  }
  const special = {
    heat: saved.special?.heat != null ? ensureStringArray(saved.special.heat) : defaultKeyMapping.special.heat,
    rage: saved.special?.rage != null ? ensureStringArray(saved.special.rage) : defaultKeyMapping.special.rage,
  };
  return { directions, buttons, special };
}

type KeyMappingPageProps = {
  keyMapping: KeyMapping;
  onMappingChange: (mapping: KeyMapping) => void;
  onBack: () => void;
};

const DIRECTION_LABELS: Record<string, string> = {
  u: '↑',
  d: '↓',
  f: '→',
  b: '←',
};

export function KeyMappingPage({ keyMapping, onMappingChange, onBack }: KeyMappingPageProps) {
  const handleReset = () => {
    onMappingChange(defaultKeyMapping);
    saveKeyMapping(defaultKeyMapping);
  };

  return (
    <div className="app keymap-page">
      <header className="header">
        <h1>키 매핑</h1>
        <p className="key-hint" style={{ fontSize: '1.5rem', marginTop: '1rem' }}>Hello World</p>
        <p className="key-hint">입력 시 사용되는 키 설정입니다.</p>
        <nav className="page-nav">
          <button type="button" className="nav-link" onClick={onBack}>
            ← 커맨드 생성기
          </button>
        </nav>
      </header>

      <div className="keymap-content">
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
              {(['u', 'd', 'f', 'b'] as const).map((key) => (
                <tr key={key}>
                  <td>{DIRECTION_LABELS[key]}</td>
                  <td className="keymap-keys">{keyCodesToLabel(ensureStringArray(keyMapping.directions[key]))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

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
              {Object.entries(keyMapping.buttons).map(([cmd, codes]) => (
                <tr key={cmd}>
                  <td>{cmd}</td>
                  <td className="keymap-keys">{keyCodesToLabel(ensureStringArray(codes))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

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
                <td>히트 버스트</td>
                <td className="keymap-keys">{keyCodesToLabel(ensureStringArray(keyMapping.special.heat))}</td>
              </tr>
              <tr>
                <td>레이지 아츠</td>
                <td className="keymap-keys">{keyCodesToLabel(ensureStringArray(keyMapping.special.rage))}</td>
              </tr>
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
