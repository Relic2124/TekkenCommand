import { useState } from 'react';
import { defaultKeyMapping, keyCodeToLabel } from './utils/keyMapping.js';
import guideInputGif from './guide_images/guide_input.gif';
import guideOutputGif from './guide_images/guide_output.gif';
import './GuideModal.css';

type GuideSection = 'input' | 'keys' | 'example';

const SECTIONS: { id: GuideSection; title: string }[] = [
  { id: 'input', title: '1. 입력 방법' },
  { id: 'keys', title: '2. 기본 키 설정' },
  { id: 'example', title: '3. 사용 예제' },
];

export function GuideModal({ onClose }: { onClose: () => void }) {
  const [openId, setOpenId] = useState<GuideSection | null>('input');

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
                  {id === 'example' && <GuideExampleSection />}
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
      <p>철권과 동일하게 <strong>60프레임 단위</strong>로 입력을 받습니다.</p>
      <p>이동 커맨드는 <strong>10프레임 이상 유지</strong>하면 입력됩니다.</p>
      <p>
        표기에서 <strong>Korean</strong>은 1·2·3·4, LP·RP·LK·RK 등으로,{' '}
        <strong>English</strong>는 u·d·f·b·1·2·3·4 등으로 입력 표기를 바꿉니다.
      </p>
    </div>
  );
}

function GuideKeysSection() {
  const d = defaultKeyMapping.directions;
  const b = defaultKeyMapping.buttons;
  const s = defaultKeyMapping.special;

  const dirRows = [
    { label: '위(u)', codes: d.u },
    { label: '아래(d)', codes: d.d },
    { label: '앞(f)', codes: d.f },
    { label: '뒤(b)', codes: d.b },
    { label: '중립(n)', codes: d.n },
  ];
  const buttonRows = Object.entries(b).map(([cmd, codes]) => ({ cmd, codes }));
  const specialRows = [
    { label: '히트 버스트', codes: s.heat },
    { label: '레이지 아츠', codes: s.rage },
  ];

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
          {dirRows.map(({ label, codes }) => (
            <tr key={label}>
              <td>방향 · {label}</td>
              <td>{codes.map(keyCodeToLabel).join(', ')}</td>
            </tr>
          ))}
          {buttonRows.map(({ cmd, codes }) => (
            <tr key={cmd}>
              <td>버튼 · {cmd}</td>
              <td>{codes.map(keyCodeToLabel).join(', ')}</td>
            </tr>
          ))}
          {specialRows.map(({ label, codes }) => (
            <tr key={label}>
              <td>특수 · {label}</td>
              <td>{codes.map(keyCodeToLabel).join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GuideExampleSection() {
  return (
    <div className="guide-section guide-example">
      <div className="guide-example-row">
        <div className="guide-example-cell">
          <span className="guide-example-label">입력</span>
          <img src={guideInputGif} alt="입력 예제" className="guide-example-gif" />
        </div>
        <div className="guide-example-cell">
          <span className="guide-example-label">출력</span>
          <img src={guideOutputGif} alt="출력 예제" className="guide-example-gif" />
        </div>
      </div>
    </div>
  );
}
