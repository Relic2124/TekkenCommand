import { useRef, useCallback, useEffect, Fragment, useState } from 'react';
import { useCommandInput } from './hooks/useCommandInput.js';
import type { CommandItem, KeyMapping } from './types/index.js';
import { KeyMappingPage, loadKeyMapping, saveKeyMapping } from './KeyMappingPage.js';
import { getNotationImageUrl } from './utils/notationImages.js';
import { commandToNotationString, type InputNotationMode } from './utils/notationString.js';
import './App.css';

function commandToImageName(item: CommandItem): string | null {
  switch (item.type) {
    case 'direction':
      return item.value;
    case 'button':
      return item.value;
    case 'special':
      return null; // heat, rage는 텍스트로 표시
    case 'text':
      return null;
    default:
      return null;
  }
}

function InputCommand({ item, mode }: { item: CommandItem; mode: InputNotationMode }) {
  const notation = commandToNotationString(item, mode);
  const isSpecial = item.type === 'special';
  const isText = item.type === 'text';
  return (
    <span className={isSpecial ? 'input-special' : isText ? 'input-text' : 'input-symbol'}>
      {notation}
    </span>
  );
}

function OutputCommand({ item }: { item: CommandItem }) {
  if (item.type === 'text') {
    return (
      <span className="output-text-wrap">
        <span className="output-text">{item.value}</span>
      </span>
    );
  }
  if (item.type === 'special' && item.value === 'rage') {
    return (
      <span className="output-text-wrap">
        <span className="output-text">레이지 아츠</span>
      </span>
    );
  }
  if (item.type === 'special' && item.value === 'heat') {
    return (
      <span className="output-text-wrap">
        <span className="output-text">히트 버스트</span>
      </span>
    );
  }
  if (item.type === 'special' && item.value === 'heatSmash') {
    return (
      <span className="output-text-wrap">
        <span className="output-text">히트 스매시</span>
      </span>
    );
  }
  if (item.type === 'notation') {
    const url = getNotationImageUrl(item.value);
    if (!url) return <span className="output-fallback">{item.value === 'next' ? '▶' : item.value === 'bracketl' ? '[' : ']'}</span>;
    return <img src={url} alt={item.value === 'next' ? 'next' : item.value === 'bracketl' ? '[' : ']'} className="notation-img" />;
  }
  const name = commandToImageName(item);
  if (!name) return null;
  const url = getNotationImageUrl(name);
  if (!url) return <span className="output-fallback">{(item as { value: string }).value}</span>;
  return <img src={url} alt={name} className="notation-img" />;
}

type Page = 'main' | 'keymap';

export default function App() {
  const outputRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState<Page>('main');
  const [keyMapping, setKeyMappingState] = useState<KeyMapping>(loadKeyMapping);

  const setKeyMapping = useCallback((next: KeyMapping) => {
    setKeyMappingState(next);
    saveKeyMapping(next);
  }, []);

  type DownloadBg = 'transparent' | 'black' | 'white' | 'dark';
  const [downloadBg, setDownloadBg] = useState<DownloadBg>('transparent');
  const [inputNotationMode, setInputNotationMode] = useState<InputNotationMode>('korean');

  const {
    commands,
    cursorIndex,
    setCursorIndex,
    isTextMode,
    currentText,
    clearCommands,
    toggleTextMode,
    finishTextInput,
    updateText,
  } = useCommandInput(keyMapping);

  const TEXT_ROW_HEIGHT = 48;
  const PADDING = 4;

  const downloadOutput = useCallback(async () => {
    const el = outputRef.current;
    if (!el) return;
    const children = Array.from(el.children) as (HTMLImageElement | HTMLSpanElement)[];
    const loadImage = (src: string): Promise<HTMLImageElement> =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });

    type DrawItem =
      | { kind: 'img'; src: string; x: number; w: number; h: number; img?: HTMLImageElement }
      | { kind: 'text'; text: string; x: number; w: number; h: number };
    const items: DrawItem[] = [];
    const measureCtx = document.createElement('canvas').getContext('2d');
    if (measureCtx) measureCtx.font = '16px sans-serif';

    for (const node of children) {
      if (node.tagName === 'IMG') {
        items.push({ kind: 'img', src: (node as HTMLImageElement).src, x: 0, w: 0, h: 0 });
      } else {
        const text = (node.textContent || '').trim();
        const w = measureCtx ? Math.ceil(measureCtx.measureText(text).width) + 16 : 40;
        items.push({ kind: 'text', text, x: 0, w, h: TEXT_ROW_HEIGHT });
      }
    }

    for (const item of items) {
      if (item.kind === 'img') {
        try {
          item.img = await loadImage(item.src);
          if (item.img) {
            item.w = item.img.naturalWidth;
            item.h = item.img.naturalHeight;
          }
        } catch {
          item.img = undefined;
          item.w = 24;
          item.h = TEXT_ROW_HEIGHT;
        }
      }
    }

    const rowHeight = Math.max(
      ...items.map((it) => (it.kind === 'img' ? it.h : it.h)),
      TEXT_ROW_HEIGHT
    );

    let x = 0;
    for (const item of items) {
      item.x = x;
      const width = item.kind === 'img' ? (item.w || 24) : item.w;
      x += width + PADDING;
    }
    const totalWidth = Math.max(x - PADDING, 1);

    const canvas = document.createElement('canvas');
    canvas.width = totalWidth;
    canvas.height = rowHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (downloadBg !== 'transparent') {
      if (downloadBg === 'black') ctx.fillStyle = '#000000';
      else if (downloadBg === 'white') ctx.fillStyle = '#ffffff';
      else ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.font = '16px sans-serif';
    ctx.fillStyle = downloadBg === 'white' ? '#333' : '#eee';

    for (const item of items) {
      if (item.kind === 'img' && item.img && item.w > 0 && item.h > 0) {
        ctx.drawImage(item.img, item.x, (rowHeight - item.h) / 2, item.w, item.h);
      } else if (item.kind === 'text') {
        ctx.fillText(item.text, item.x + 8, rowHeight / 2 + 5);
      }
    }

    const link = document.createElement('a');
    link.download = 'tekken-notation.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, [downloadBg]);

  const textInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isTextMode) textInputRef.current?.focus();
  }, [isTextMode]);

  if (page === 'keymap') {
    return (
      <KeyMappingPage
        keyMapping={keyMapping}
        onMappingChange={setKeyMapping}
        onBack={() => setPage('main')}
      />
    );
  }

  return (
    <div className="app">
      <header className="header">
        <h1>철권 8 커맨드 생성기</h1>
        <p className="key-hint">
          WASD: 이동 · 넘패드: 공격(4=1, 5=2, 1=3, 2=4, 6=1+2, 3=3+4) · 7=히트버스트 9=레이지아츠 · Enter=텍스트
        </p>
        <nav className="page-nav">
          <button type="button" className="nav-link" onClick={() => setPage('keymap')}>
            키 매핑
          </button>
        </nav>
      </header>

      <div className="panels">
        <section className="panel input-panel">
          <div className="input-panel-header">
            <h2>입력</h2>
            <div className="input-mode-row">
              <span className="input-mode-label">표기:</span>
              <button
                type="button"
                className={inputNotationMode === 'korean' ? 'input-mode-btn active' : 'input-mode-btn'}
                onClick={() => setInputNotationMode('korean')}
              >
                Korean
              </button>
              <button
                type="button"
                className={inputNotationMode === 'english' ? 'input-mode-btn active' : 'input-mode-btn'}
                onClick={() => setInputNotationMode('english')}
              >
                English
              </button>
            </div>
          </div>
          <div className="input-area" tabIndex={0}>
            {Array.from({ length: commands.length + 1 }, (_, i) => (
              <Fragment key={i}>
                <span
                  className="input-slot"
                  onClick={() => setCursorIndex(i)}
                  role="button"
                  tabIndex={-1}
                  aria-label={`커서 위치 ${i + 1}`}
                >
                  {cursorIndex === i && <span className="input-caret">|</span>}
                </span>
                {i < commands.length && (
                  <span
                    className="input-command-wrap"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCursorIndex(i + 1);
                    }}
                  >
                    <InputCommand item={commands[i]} mode={inputNotationMode} />
                  </span>
                )}
              </Fragment>
            ))}
            {isTextMode ? (
              <span className="text-cursor">
                "
                <span className="inline-text-input-wrap">
                  <span className="inline-text-input-mirror" aria-hidden="true">
                    {currentText || '\u00A0'}
                  </span>
                  <input
                    ref={textInputRef}
                    type="text"
                    className="inline-text-input"
                    value={currentText}
                    onChange={(e) => updateText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.code === 'Enter' && e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation();
                        finishTextInput(currentText);
                        textInputRef.current?.blur();
                      }
                    }}
                    aria-label="텍스트 입력"
                  />
                </span>
                <span className="caret">|</span>"
              </span>
            ) : null}
          </div>
          <div className="actions">
            <button
              type="button"
              onClick={() => {
                if (isTextMode) finishTextInput(currentText);
                else toggleTextMode();
              }}
            >
              {isTextMode ? '텍스트 입력 완료 (Enter)' : '텍스트 입력 (Enter)'}
            </button>
            <button type="button" onClick={clearCommands}>
              전체 지우기
            </button>
          </div>
        </section>

        <section className="panel output-panel">
          <h2>출력</h2>
          <div ref={outputRef} className="output-area">
            {commands.map((item, i) => (
              <OutputCommand key={i} item={item} />
            ))}
          </div>
          <div className="actions actions-output">
            <label className="download-bg-label">
              배경:
              <select
                value={downloadBg}
                onChange={(e) => setDownloadBg(e.target.value as DownloadBg)}
                className="download-bg-select"
              >
                <option value="transparent">투명</option>
                <option value="black">검정</option>
                <option value="white">하양</option>
                <option value="dark">다크 (#1a1a1a)</option>
              </select>
            </label>
            <button type="button" onClick={downloadOutput}>
              이미지 다운로드
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
