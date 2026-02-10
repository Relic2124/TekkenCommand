import { useRef, useCallback, useEffect, useLayoutEffect, Fragment, useState } from 'react';
import { useCommandInput, type SlotPositionsRef } from './hooks/useCommandInput.js';
import type { CommandItem, KeyMapping } from './types/index.js';
import { KeyMappingPage, loadKeyMapping, saveKeyMapping } from './KeyMappingPage.js';
import { GuideModal } from './GuideModal.js';
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
    if (item.value === 'linebreak') return <span className="output-linebreak" aria-hidden="true" />;
    const url = getNotationImageUrl(item.value);
    const fallbackChar = item.value === 'next' ? '▶' : item.value === 'bracketl' ? '[' : item.value === 'bracketr' ? ']' : item.value === 'parenl' ? '(' : item.value === 'parenr' ? ')' : item.value === 'tilde' ? '~' : item.value === 'linebreak' ? '↵' : '';
    const altChar = fallbackChar || 'notation';
    if (!url) return <span className="output-fallback">{fallbackChar}</span>;
    return <img src={url} alt={altChar} className="notation-img" />;
  }
  const name = commandToImageName(item);
  if (!name) return null;
  const url = getNotationImageUrl(name);
  if (!url) return <span className="output-fallback">{(item as { value: string }).value}</span>;
  return <img src={url} alt={name} className="notation-img" />;
}

type Page = 'main' | 'keymap';
type Theme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'tekken-theme';
const APP_VERSION = '1.0.0';
const GITHUB_ISSUES_URL = 'https://github.com/Relic2124/TekkenCommand/issues/new';

function getReportBugUrl(): string {
  const body = [
    '**현상 (무슨 문제인가요?)**',
    '',
    '',
    '**재현 방법**',
    '1. ',
    '2. ',
    '',
    '**환경**',
    `- 앱 버전: ${APP_VERSION}`,
    `- 브라우저: ${typeof navigator !== 'undefined' ? navigator.userAgent : '-'}`,
    `- URL: ${typeof window !== 'undefined' ? window.location.href : '-'}`,
  ].join('\n');
  const params = new URLSearchParams({
    title: '오류 제보',
    body,
  });
  return `${GITHUB_ISSUES_URL}?${params.toString()}`;
}

function getSystemTheme(): Theme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function loadTheme(): Theme {
  try {
    const s = localStorage.getItem(THEME_STORAGE_KEY);
    if (s === 'light' || s === 'dark') return s;
    return getSystemTheme();
  } catch {
    return getSystemTheme();
  }
}

export default function App() {
  const outputRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState<Page>('main');
  const [theme, setThemeState] = useState<Theme>(loadTheme);
  const [guideOpen, setGuideOpen] = useState(false);
  const [keyMapping, setKeyMappingState] = useState<KeyMapping>(loadKeyMapping);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const listener = () => {
      try {
        if (localStorage.getItem(THEME_STORAGE_KEY) == null) {
          setThemeState(getSystemTheme());
        }
      } catch {
        /* ignore */
      }
    };
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
  }, []);

  const setKeyMapping = useCallback((next: KeyMapping) => {
    setKeyMappingState(next);
    saveKeyMapping(next);
  }, []);

  type DownloadBg = 'transparent' | 'black' | 'white' | 'dark';
  const [downloadBg, setDownloadBg] = useState<DownloadBg>('transparent');
  const [inputNotationMode, setInputNotationMode] = useState<InputNotationMode>('korean');

  const inputAreaRef = useRef<HTMLDivElement>(null);
  const slotPositionsRef: SlotPositionsRef = useRef<{ tops: number[]; lefts: number[] } | null>(null);
  /** linebreak 이후 커서가 위(eol) 슬롯에 보일지, 아래줄(primary) 슬롯에 보일지 제어 */
  const [linebreakCursor, setLinebreakCursor] = useState<{ index: number; mode: 'eol' | 'below' } | null>(null);

  const {
    commands,
    cursorIndex,
    setCursorIndex,
    selection,
    setSelection,
    selectAll,
    isTextMode,
    textEditIndex,
    currentText,
    clearCommands,
    toggleTextMode,
    finishTextInput,
    updateText,
    startTextEdit,
    clearSelectionAndMoveCursorToEnd,
  } = useCommandInput(keyMapping, slotPositionsRef);

  useLayoutEffect(() => {
    const el = inputAreaRef.current;
    if (!el) return;
    const MEASURE_DEBOUNCE_MS = 80;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const measure = () => {
      const slots = el.querySelectorAll('.input-slot[data-visual="primary"]');
      if (slots.length === 0) {
        slotPositionsRef.current = null;
        return;
      }
      const rects = Array.from(slots).map((s) => s.getBoundingClientRect());
      slotPositionsRef.current = {
        tops: rects.map((r) => r.top),
        lefts: rects.map((r) => r.left),
      };
    };
    const scheduleMeasure = () => {
      if (timeoutId != null) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        timeoutId = null;
        measure();
      }, MEASURE_DEBOUNCE_MS);
    };
    measure();
    const ro = new ResizeObserver(scheduleMeasure);
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (timeoutId != null) clearTimeout(timeoutId);
    };
  }, [commands.length, page]);

  /* linebreak eol 모드에서 다른 위치로 커서가 이동하면 eol 모드 해제 */
  useEffect(() => {
    if (linebreakCursor && linebreakCursor.index !== cursorIndex) {
      setLinebreakCursor(null);
    }
  }, [cursorIndex, linebreakCursor]);

  /** 선택 앵커: 일반 클릭 시 설정, Shift+클릭 시 이 위치부터 선택 */
  const selectionAnchorRef = useRef<number>(0);

  /** Shift+클릭: 앵커~target 범위를 선택하고 커서를 target으로 이동 */
  const handleShiftClick = useCallback((target: number) => {
    /* 선택이 없으면 현재 커서를 앵커로 사용(초기 상태·전체 지우기 후 등) */
    if (!selection) selectionAnchorRef.current = cursorIndex;
    const anchor = selectionAnchorRef.current;
    if (anchor === target) {
      setSelection(null);
    } else {
      setSelection({ start: Math.min(anchor, target), end: Math.max(anchor, target) });
    }
    setCursorIndex(target);
  }, [selection, cursorIndex, setSelection, setCursorIndex]);

  /** 일반 클릭: 앵커를 갱신하고 선택 해제·커서 이동 */
  const handleNormalClick = useCallback((pos: number) => {
    selectionAnchorRef.current = pos;
    setSelection(null);
    setCursorIndex(pos);
  }, [setSelection, setCursorIndex]);

  const dragAnchorStartRef = useRef<number>(0);
  const dragAnchorEndRef = useRef<number>(0);
  const isDraggingRef = useRef(false);
  const didDragRef = useRef(false);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const anchorStart = dragAnchorStartRef.current;
      const anchorEnd = dragAnchorEndRef.current;
      let minP: number;
      let maxP: number;
      const cmdEl = el?.closest?.('[data-command-index]');
      const posEl = el?.closest?.('[data-position]');
      const fillEl = el?.closest?.('.input-area-fill[data-position]');
      if (cmdEl) {
        const i = parseInt((cmdEl as HTMLElement).getAttribute('data-command-index') ?? '', 10);
        if (!Number.isNaN(i)) {
          minP = i;
          maxP = i + 1;
        } else if (posEl) {
          const p = parseInt((posEl as HTMLElement).getAttribute('data-position') ?? '', 10);
          if (Number.isNaN(p)) return;
          minP = maxP = p;
        } else return;
      } else if (posEl) {
        const p = parseInt((posEl as HTMLElement).getAttribute('data-position') ?? '', 10);
        if (Number.isNaN(p)) return;
        minP = maxP = p;
      } else if (fillEl) {
        const p = parseInt((fillEl as HTMLElement).getAttribute('data-position') ?? '', 10);
        if (Number.isNaN(p)) return;
        minP = maxP = p;
      } else return;
      const newStart = Math.min(anchorStart, minP);
      const newEnd = Math.max(anchorEnd, maxP);
      if (newStart < newEnd) {
        setSelection({ start: newStart, end: newEnd });
        setCursorIndex(newEnd);
        didDragRef.current = true;
      } else {
        setSelection(null);
        setCursorIndex(newStart);
      }
    };
    const onMouseUp = () => {
      isDraggingRef.current = false;
      setTimeout(() => {
        didDragRef.current = false;
      }, 0);
    };
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('mouseup', onMouseUp, true);
    return () => {
      document.removeEventListener('mousemove', onMouseMove, true);
      document.removeEventListener('mouseup', onMouseUp, true);
    };
  }, [setSelection, setCursorIndex]);

  const hasSelection = selection && selection.start < selection.end;
  const isCaretVisible = !hasSelection && !isTextMode;

  /* 원본 커맨드 이미지 크기(1040) 기준, 출력창 비율(아이콘 32px / 글자 14px / 패딩 2,6 / radius 4) 적용 */
  const OUTPUT_ICON_HEIGHT = 32;
  const OUTPUT_FONT_SIZE = 14;
  const OUTPUT_PAD_H = 6;
  const OUTPUT_PAD_V = 2;
  const OUTPUT_RADIUS = 4;
  const OUTPUT_ROW_GAP = 48;
  const NATURAL_ICON_HEIGHT = 1040;
  const scale = NATURAL_ICON_HEIGHT / OUTPUT_ICON_HEIGHT;
  const DOWNLOAD_FONT_SIZE = Math.round(OUTPUT_FONT_SIZE * scale);
  const DOWNLOAD_TEXT_PAD_H = Math.round(OUTPUT_PAD_H * scale);
  const DOWNLOAD_TEXT_PAD_V = Math.round(OUTPUT_PAD_V * scale);
  const DOWNLOAD_TEXT_BOX_RADIUS = Math.round(OUTPUT_RADIUS * scale);
  const TEXT_ROW_HEIGHT = Math.round(OUTPUT_ROW_GAP * scale);
  const PADDING = Math.round(4 * scale);

  const downloadOutput = useCallback(async () => {
    const el = outputRef.current;
    if (!el) return;
    const children = Array.from(el.children) as (HTMLImageElement | HTMLSpanElement | HTMLBRElement | HTMLElement)[];
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
    const measureCtx = document.createElement('canvas').getContext('2d');
    const fontStr = `${DOWNLOAD_FONT_SIZE}px sans-serif`;
    if (measureCtx) measureCtx.font = fontStr;

    const rows: DrawItem[][] = [];
    let currentRow: DrawItem[] = [];

    const isLinebreak = (node: Element) =>
      node.tagName === 'BR' || (node instanceof HTMLElement && node.classList.contains('output-linebreak'));
    for (const node of children) {
      if (isLinebreak(node)) {
        if (currentRow.length) {
          rows.push(currentRow);
          currentRow = [];
        }
        continue;
      }
      if (node.tagName === 'IMG') {
        currentRow.push({ kind: 'img', src: (node as HTMLImageElement).src, x: 0, w: 0, h: 0 });
      } else {
        const text = (node.textContent || '').trim();
        const textW = measureCtx ? Math.ceil(measureCtx.measureText(text).width) : 40;
        const w = textW + DOWNLOAD_TEXT_PAD_H * 2;
        currentRow.push({ kind: 'text', text, x: 0, w, h: TEXT_ROW_HEIGHT });
      }
    }
    if (currentRow.length) rows.push(currentRow);
    if (rows.length === 0) return;

    for (const row of rows) {
      for (const item of row) {
        if (item.kind === 'img') {
          try {
            item.img = await loadImage(item.src);
            if (item.img) {
              item.w = item.img.naturalWidth;
              item.h = item.img.naturalHeight;
            } else {
              item.w = NATURAL_ICON_HEIGHT;
              item.h = NATURAL_ICON_HEIGHT;
            }
          } catch {
            item.img = undefined;
            item.w = NATURAL_ICON_HEIGHT;
            item.h = NATURAL_ICON_HEIGHT;
          }
        }
      }
    }

    const rowHeights = rows.map((row) =>
      Math.max(...row.map((it) => (it.kind === 'img' ? it.h : it.h)), TEXT_ROW_HEIGHT)
    );
    const totalHeight = rowHeights.reduce((a, b) => a + b + PADDING, -PADDING);
    const totalWidth = Math.max(
      ...rows.map((row) => {
        let x = 0;
        for (const item of row) {
          const width = item.kind === 'img' ? (item.w || 24) : item.w;
          x += width + PADDING;
        }
        return Math.max(x - PADDING, 1);
      }),
      1
    );

    for (const row of rows) {
      const rowHeight = Math.max(...row.map((it) => (it.kind === 'img' ? it.h : it.h)), TEXT_ROW_HEIGHT);
      let x = 0;
      for (const item of row) {
        item.x = x;
        const width = item.kind === 'img' ? (item.w || 24) : item.w;
        x += width + PADDING;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = totalWidth;
    canvas.height = totalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (downloadBg !== 'transparent') {
      if (downloadBg === 'black') ctx.fillStyle = '#000000';
      else if (downloadBg === 'white') ctx.fillStyle = '#ffffff';
      else ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.font = fontStr;
    const textColor = downloadBg === 'white' ? '#333333' : '#e4e4e7';
    const textBoxBg = downloadBg === 'white' ? '#e4e4e7' : '#252528';

    let y = 0;
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      const rowHeight = rowHeights[r];
      for (const item of row) {
        if (item.kind === 'img' && item.img && item.w > 0 && item.h > 0) {
          ctx.drawImage(item.img, item.x, y + (rowHeight - item.h) / 2, item.w, item.h);
        } else if (item.kind === 'text') {
          const boxH = DOWNLOAD_FONT_SIZE + DOWNLOAD_TEXT_PAD_V * 2;
          const boxY = y + (rowHeight - boxH) / 2;
          ctx.fillStyle = textBoxBg;
          const r = DOWNLOAD_TEXT_BOX_RADIUS;
          ctx.beginPath();
          ctx.roundRect(item.x, boxY, item.w, boxH, r);
          ctx.fill();
          ctx.fillStyle = textColor;
          ctx.textBaseline = 'middle';
          ctx.fillText(item.text, item.x + DOWNLOAD_TEXT_PAD_H, y + rowHeight / 2);
        }
      }
      y += rowHeight + PADDING;
    }

    const link = document.createElement('a');
    link.download = 'tekken_command.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, [downloadBg]);

  const textInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isTextMode) textInputRef.current?.focus();
  }, [isTextMode]);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (!(e.target as HTMLElement).closest('.input-area')) setSelection(null);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [setSelection]);

  if (page === 'keymap') {
    return (
      <KeyMappingPage
        keyMapping={keyMapping}
        onMappingChange={setKeyMapping}
        onBack={() => setPage('main')}
        theme={theme}
        onThemeChange={setTheme}
      />
    );
  }

  return (
    <div className="app">
      <header className="header">
        <h1>철권 8 커맨드 이미지 생성기</h1>
        <nav className="page-nav">
          <button
            type="button"
            className="theme-toggle-btn"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            title={theme === 'light' ? '라이트 테마로 전환' : '다크 테마로 전환'}
          >
            {theme === 'light' ? '☀️ 라이트' : '🌙 다크'}
          </button>
          <button type="button" className="nav-link" onClick={() => setGuideOpen(true)}>
            가이드
          </button>
          <button type="button" className="nav-link" onClick={() => setPage('keymap')}>
            키 매핑
          </button>
          <a
            href={getReportBugUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="nav-link nav-link-anchor"
            title="GitHub Issues로 오류·개선 사항 제보"
          >
            오류 제보
          </a>
        </nav>
      </header>

      {guideOpen && <GuideModal onClose={() => setGuideOpen(false)} />}

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
          <div ref={inputAreaRef} className="input-area" tabIndex={0}>
            {Array.from({ length: commands.length + 1 }, (_, i) => {
              return (
              <Fragment key={i}>
              <span className="input-cell">
                <span
                  className="input-slot"
                  data-visual="primary"
                  data-position={i}
                  role="button"
                  tabIndex={-1}
                  aria-label={`커서 위치 ${i + 1}`}
                  onMouseDown={(e) => {
                    if (e.button !== 0) return;
                    if (e.shiftKey) { handleShiftClick(i); isDraggingRef.current = false; return; }
                    selectionAnchorRef.current = i;
                    dragAnchorStartRef.current = i;
                    dragAnchorEndRef.current = i;
                    isDraggingRef.current = true;
                    setSelection(null);
                    setCursorIndex(i);
                  }}
                  onClick={(e) => {
                    if (e.shiftKey) return;
                    if (didDragRef.current) {
                      didDragRef.current = false;
                      return;
                    }
                    setLinebreakCursor(null);
                    handleNormalClick(i);
                  }}
                >
                  {cursorIndex === i &&
                    isCaretVisible &&
                    !(isTextMode && textEditIndex === null) &&
                    !(linebreakCursor && linebreakCursor.index === i && linebreakCursor.mode === 'eol') && (
                    <span className="input-caret">|</span>
                  )}
                </span>
                {isTextMode && textEditIndex === null && i === cursorIndex ? (
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
                        onBlur={() => finishTextInput(currentText)}
                        onKeyDown={(e) => {
                          if (e.code === 'Enter' && e.key === 'Enter') {
                            e.preventDefault();
                            e.stopPropagation();
                            textInputRef.current?.blur();
                          }
                        }}
                        aria-label="텍스트 입력"
                      />
                    </span>
                    {isCaretVisible ? <span className="caret">|</span> : null}
                    "
                  </span>
                ) : null}
                {i < commands.length && (
                  <span
                    className={`input-command-wrap${selection && i >= selection.start && i < selection.end ? ' input-command-selected' : ''}${commands[i].type === 'text' ? ' input-command-text' : ''}${textEditIndex === i ? ' input-command-editing' : ''}`}
                    data-position={i + 1}
                    data-command-index={i}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      if (e.button !== 0) return;
                      if (textEditIndex !== null && textEditIndex !== i) finishTextInput(currentText);
                      if (textEditIndex === i) return;
                      if (e.shiftKey) { handleShiftClick(i + 1); isDraggingRef.current = false; return; }
                      setLinebreakCursor(null);
                      selectionAnchorRef.current = i + 1;
                      dragAnchorStartRef.current = i;
                      dragAnchorEndRef.current = i + 1;
                      isDraggingRef.current = true;
                      setSelection({ start: i, end: i + 1 });
                      setCursorIndex(i + 1);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (e.shiftKey) return;
                      if (textEditIndex !== null && textEditIndex !== i) finishTextInput(currentText);
                      if (textEditIndex === i) return;
                      if (didDragRef.current) {
                        didDragRef.current = false;
                        return;
                      }
                      setLinebreakCursor(null);
                      selectionAnchorRef.current = i + 1;
                      setSelection({ start: i, end: i + 1 });
                      setCursorIndex(i + 1);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      if (commands[i].type === 'text' && !isTextMode) startTextEdit(i);
                    }}
                    title={commands[i].type === 'text' ? '더블클릭하여 수정' : undefined}
                  >
                    {textEditIndex === i ? (
                      <span className="text-cursor text-cursor-inplace">
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
                            onBlur={() => finishTextInput(currentText)}
                            onKeyDown={(e) => {
                              if (e.code === 'Enter' && e.key === 'Enter') {
                                e.preventDefault();
                                e.stopPropagation();
                                textInputRef.current?.blur();
                              }
                            }}
                            aria-label="텍스트 수정"
                          />
                        </span>
                        {isCaretVisible ? <span className="caret">|</span> : null}
                        "
                      </span>
                    ) : (
                      <InputCommand item={commands[i]} mode={inputNotationMode} />
                    )}
                  </span>
                )}
              </span>
              {i < commands.length && commands[i].type === 'notation' && commands[i].value === 'linebreak' && (
                <>
                  {/* 같은 줄 끝(eol)에 표시되는 보조 슬롯 - 클릭은 fill에서 처리, caret만 표시 */}
                  <span
                    className="input-slot input-slot-eol"
                    data-position={i + 1}
                    data-visual="secondary"
                    aria-hidden="true"
                  >
                    {cursorIndex === i + 1 &&
                      isCaretVisible &&
                      !(isTextMode && textEditIndex === null) &&
                      linebreakCursor &&
                      linebreakCursor.index === i + 1 &&
                      linebreakCursor.mode === 'eol' && <span className="input-caret">|</span>}
                  </span>
                  <span
                    className="input-area-fill"
                    data-position={i + 1}
                    aria-label="빈 영역"
                    onMouseDown={(e) => {
                      if (e.button !== 0) return;
                      e.stopPropagation();
                      if (textEditIndex !== null) finishTextInput(currentText);
                      if (e.shiftKey) {
                        handleShiftClick(i + 1);
                        return;
                      }
                      setLinebreakCursor({ index: i + 1, mode: 'eol' });
                      selectionAnchorRef.current = i + 1;
                      dragAnchorStartRef.current = i + 1;
                      dragAnchorEndRef.current = i + 1;
                      isDraggingRef.current = true;
                      setSelection(null);
                      setCursorIndex(i + 1);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (e.shiftKey) return;
                      if (didDragRef.current) {
                        didDragRef.current = false;
                        return;
                      }
                      if (textEditIndex !== null) finishTextInput(currentText);
                       /* 클릭으로 커서를 eol에 두고 싶을 때도 모드 유지 */
                      setLinebreakCursor({ index: i + 1, mode: 'eol' });
                      handleNormalClick(i + 1);
                    }}
                  />
                  <span className="input-linebreak" aria-hidden="true" />
                </>
              )}
              </Fragment>
              );
            })}
            <span
              className="input-area-fill"
              data-position={commands.length}
              aria-label="빈 영역"
              onMouseDown={(e) => {
                if (e.button !== 0) return;
                e.stopPropagation();
                if (textEditIndex !== null) finishTextInput(currentText);
                if (e.shiftKey) { handleShiftClick(commands.length); return; }
                setLinebreakCursor(null);
                selectionAnchorRef.current = commands.length;
                dragAnchorStartRef.current = commands.length;
                dragAnchorEndRef.current = commands.length;
                isDraggingRef.current = true;
                clearSelectionAndMoveCursorToEnd();
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (e.shiftKey) return;
                if (didDragRef.current) {
                  didDragRef.current = false;
                  return;
                }
                if (textEditIndex !== null) finishTextInput(currentText);
                setLinebreakCursor(null);
                selectionAnchorRef.current = commands.length;
                clearSelectionAndMoveCursorToEnd();
              }}
            />
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
