import { useState, useEffect } from 'react';
import { defaultKeyMapping, keyCodesToLabel } from './utils/keyMapping.js';
import guideInputGif from './guide_images/guide_input.gif';
import guideOutputGif from './guide_images/guide_output.gif';
import './GuideModal.css';

type GuideSection = 'input' | 'keys' | 'example';

const SECTIONS: { id: GuideSection; title: string }[] = [
  { id: 'input', title: '입력 방법' },
  { id: 'keys', title: '기본 키 설정' },
  { id: 'example', title: '사용 예제' },
];

export function GuideModal({ onClose }: { onClose: () => void }) {
  const [openId, setOpenId] = useState<GuideSection | null>('input');
  const [exampleLoadKey, setExampleLoadKey] = useState(0);

  useEffect(() => {
    if (openId === 'example') setExampleLoadKey((k) => k + 1);
  }, [openId]);

  return (
    <div className="guide-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="가이드">
      <div className="guide-modal" onClick={(e) => e.stopPropagation()}>
        <div className="guide-modal-header">
          <h2>가이드</h2>
          <button type="button" className="guide-close-btn" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>
        <div className="guide-accordion">
          {SECTIONS.map(({ id, title }) => (
            <div key={id} className="guide-accordion-item">
              <button
                type="button"
                className="guide-accordion-trigger"
                onClick={() => setOpenId((prev) => (prev === id ? null : id))}
                aria-expanded={openId === id}
              >
                <span>{title}</span>
                <span className="guide-accordion-icon">{openId === id ? '▼' : '▶'}</span>
              </button>
              {openId === id && (
                <div className="guide-accordion-body">
                  {id === 'input' && <GuideInputSection />}
                  {id === 'keys' && <GuideKeysSection />}
                  {id === 'example' && (
                    <GuideExampleSection
                      key={exampleLoadKey}
                      loadKey={exampleLoadKey}
                    />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function GuideInputSection() {
  return (
    <div className="guide-section guide-input">
      <p>기본적으로 철권에서 입력하는 방식과 동일하게 입력합니다.</p>
      <p>철권과 동일하게 <strong>60프레임 단위</strong>로 입력을 받습니다.</p>
      <p>홀드 입력은 이동 커맨드를 <strong>10프레임 이상 유지</strong>하면 입력됩니다.</p>
      <p>
        표기 설정에서 <strong>Korean</strong>은 1·2·3·4·n·6·7·8·9, LP·RP·LK·RK 등으로,{' '}
        <strong>English</strong>는 u·d·f·b·1·2·3·4 등으로 입력 표기합니다.
      </p>
      <p>
        <strong>텍스트 입력</strong>: <kbd>Enter</kbd>를 누르면 텍스트 입력 모드로 전환됩니다. 적을 내용(예: 토네이도, 카운터 등)을 입력한 뒤 다시 <kbd>Enter</kbd>를 누르면 커서 위치에 삽입됩니다.
      </p>
    </div>
  );
}

function GuideKeysSection() {
  const d = defaultKeyMapping.directions;
  const b = defaultKeyMapping.buttons;
  const s = defaultKeyMapping.special;

  const keyRows: { label: string; codes: string[] }[] = [
    { label: '↑', codes: d.u },
    { label: '↓', codes: d.d },
    { label: '→', codes: d.f },
    { label: '←', codes: d.b },
    { label: 'n', codes: d.n },
    { label: 'LP', codes: b['1'] },
    { label: 'RP', codes: b['2'] },
    { label: 'LK', codes: b['3'] },
    { label: 'RK', codes: b['4'] },
    { label: 'AP', codes: b['1+2'] },
    { label: 'AK', codes: b['3+4'] },
    { label: '히트 버스트/히트 스매시', codes: s.heat },
    { label: '레이지 아츠', codes: s.rage },
  ];
  const formatKeys = (codes: string[]) => keyCodesToLabel(codes, ', ');

  return (
    <div className="guide-section guide-keys">
      <table className="guide-keys-table">
        <thead>
          <tr>
            <th>구분</th>
            <th>키</th>
          </tr>
        </thead>
        <tbody>
          {keyRows.map(({ label, codes }) => (
            <tr key={label}>
              <td>{label}</td>
              <td>{formatKeys(codes)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GuideExampleSection({ loadKey }: { loadKey: number }) {
  const sep = guideInputGif.includes('?') ? '&' : '?';
  const inputSrc = `${guideInputGif}${sep}t=${loadKey}`;
  const outputSrc = `${guideOutputGif}${sep}t=${loadKey}`;
  return (
    <div className="guide-section guide-example">
      <div className="guide-example-row">
        <div className="guide-example-cell">
          <span className="guide-example-label">입력</span>
          <img src={inputSrc} alt="입력 예제" className="guide-example-gif" />
        </div>
        <div className="guide-example-cell">
          <span className="guide-example-label">출력</span>
          <img src={outputSrc} alt="출력 예제" className="guide-example-gif" />
        </div>
      </div>
    </div>
  );
}
