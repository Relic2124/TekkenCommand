import { useState, useEffect, useCallback, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { CommandItem, KeyMapping, DirectionNotation } from '../types/index.js';
import {
  defaultKeyMapping,
  findDirectionFromKeys,
  findButtonFromKeys,
  findSpecialFromKeys,
} from '../utils/keyMapping.js';
import { commandsToCopyText, parsePasteText } from '../utils/commandClipboard.js';

const FPS = 60;
const FRAME_MS = 1000 / FPS;

/** 방향에 hold 접미사 (n이면 null) */
function toHoldNotation(dir: DirectionNotation | null): DirectionNotation | null {
  if (!dir || dir === 'n') return null;
  if (dir.endsWith('hold')) return dir;
  const base = dir.replace(/hold$/, '');
  return (base + 'hold') as DirectionNotation;
}

export type SelectionRange = { start: number; end: number };

export type HistoryState = {
  commands: CommandItem[];
  cursorIndex: number;
  selection: SelectionRange | null;
};

const HISTORY_MAX = 100;

const initialHistoryState: HistoryState = {
  commands: [],
  cursorIndex: 0,
  selection: null,
};

/** 한 줄에 표시되는 슬롯 개수. 위치 정보 없을 때 위/아래 화살표 폴백용 */
const DEFAULT_SLOTS_PER_ROW = 12;

/** 슬롯별 화면 좌표. ArrowUp/Down 시 실제 줄·열 기준 이동에 사용 */
export type SlotPositionsRef = MutableRefObject<{ tops: number[]; lefts: number[] } | null>;

const ROW_TOLERANCE_PX = 4; /* 같은 줄로 볼 top 차이(px) */

/** 현재 슬롯(cur) 기준 한 줄 위에서 같은 열(가장 가까운 left) 슬롯 인덱스. 없으면 -1 */
function findSlotRowAbove(tops: number[], lefts: number[], cur: number): number {
  const curTop = tops[cur] ?? 0;
  const curLeft = lefts[cur] ?? 0;
  const above = tops
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t < curTop - ROW_TOLERANCE_PX);
  if (above.length === 0) return -1;
  const rowAboveTop = Math.max(...above.map(({ t }) => t));
  const inRow = above.filter(({ t }) => Math.abs(t - rowAboveTop) <= ROW_TOLERANCE_PX);
  let best = -1;
  let bestDist = Infinity;
  for (const { i } of inRow) {
    const dist = Math.abs(lefts[i] - curLeft);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

/** 현재 슬롯(cur) 기준 한 줄 아래에서 같은 열 슬롯 인덱스. 없으면 -1 */
function findSlotRowBelow(tops: number[], lefts: number[], cur: number): number {
  const curTop = tops[cur] ?? 0;
  const curLeft = lefts[cur] ?? 0;
  const below = tops
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t > curTop + ROW_TOLERANCE_PX);
  if (below.length === 0) return -1;
  const rowBelowTop = Math.min(...below.map(({ t }) => t));
  const inRow = below.filter(({ t }) => Math.abs(t - rowBelowTop) <= ROW_TOLERANCE_PX);
  let best = -1;
  let bestDist = Infinity;
  for (const { i } of inRow) {
    const dist = Math.abs(lefts[i] - curLeft);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

export function useCommandInput(
  customMapping?: Partial<KeyMapping>,
  slotPositionsRef?: SlotPositionsRef
) {
  const [commands, setCommands] = useState<CommandItem[]>([]);
  const [cursorIndex, setCursorIndexState] = useState(0);
  const [selection, setSelectionState] = useState<SelectionRange | null>(null);
  const selectionRef = useRef<SelectionRange | null>(null);
  const cursorIndexRef = useRef(0);
  const commandsLengthRef = useRef(0);
  const commandsRef = useRef<CommandItem[]>([]);
  const [isTextMode, setIsTextMode] = useState(false);
  const [textEditIndex, setTextEditIndex] = useState<number | null>(null);
  const textEditIndexRef = useRef<number | null>(null);
  const [currentText, setCurrentText] = useState('');
  const pressedKeys = useRef<Set<string>>(new Set());
  const keyMapping = useRef<KeyMapping>({ ...defaultKeyMapping, ...customMapping });

  /* 초기 항목은 commands를 새 배열로 두어 참조 공유 방지. 그렇지 않으면 history[0].commands가 나중에 변경되어 복원 시 빈 배열이 안 나옴 */
  const historyRef = useRef<HistoryState[]>([{ ...initialHistoryState, commands: [] }]);
  const historyIndexRef = useRef(0);
  const historyFlagRef = useRef(0); /* 0: 일반, 1: 커서/선택 변경됨 */
  /** 현재 장면 위치(1-based). history에는 현재 장면 제외 저장되므로, tip일 때 sceneRef = length */
  const sceneRef = useRef(1);

  useEffect(() => {
    console.log('[undo] initial', { history: historyRef.current.map((s, i) => ({ i, commands: s.commands, cursor: s.cursorIndex, sel: s.selection })), index: historyIndexRef.current, scene: sceneRef.current });
  }, []);

  const prevDirection = useRef<DirectionNotation | null>(null);
  const framesHeld = useRef<number>(0);
  const prevButton = useRef<string | null>(null);
  const prevSpecial = useRef<'heat' | 'rage' | null>(null);
  const didReplaceWithHoldRef = useRef(false);
  const didReplaceHeatWithSmashRef = useRef(false);
  const lastHeatPressTimeRef = useRef(0);

  const HOLD_FRAME_THRESHOLD = 10;
  const HEAT_DOUBLE_PRESS_MS = 400;

  useEffect(() => {
    cursorIndexRef.current = cursorIndex;
  }, [cursorIndex]);

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  useEffect(() => {
    commandsLengthRef.current = commands.length;
    commandsRef.current = commands;
    setCursorIndexState((prev) => Math.min(prev, commands.length));
    setSelectionState((sel) => {
      if (!sel) return null;
      if (selectionRef.current === null) return null; /* 방금 선택 해제된 경우 유지 */
      const start = Math.min(sel.start, commands.length);
      const end = Math.min(sel.end, commands.length);
      return start < end ? { start, end } : null;
    });
  }, [commands.length, commands]);

  const snapshotFromRefs = useCallback((): HistoryState => ({
    commands: commandsRef.current.slice(),
    cursorIndex: cursorIndexRef.current,
    selection: selectionRef.current ? { ...selectionRef.current } : null,
  }), []);

  const pushHistory = useCallback((truncateRedo: boolean) => {
    const history = historyRef.current;
    const idx = historyIndexRef.current;
    const scene = sceneRef.current;
    /* idx=0, scene=1(차이 1)일 때 push하면 [S0,S0]가 되어 (2,1,3)이 됨. 이때는 push 없이 scene만 2로 올려 (1,0,2) 유지 */
    if (idx === 0 && scene === 1) {
      if (truncateRedo) history.length = 1;
      sceneRef.current = 2;
      historyFlagRef.current = 0;
      return;
    }
    if (truncateRedo) history.length = idx + 1;
    history.push(snapshotFromRefs());
    historyIndexRef.current = history.length - 1;
    while (history.length > HISTORY_MAX) {
      history.shift();
      historyIndexRef.current--;
    }
    historyFlagRef.current = 0;
    /* tip = 현재 장면이 history에 없음(모델). scene=length+1로 두어 undo 시 idx+1<scene 성립 */
    sceneRef.current = history.length + 1;
    console.log('[undo] after push', { truncateRedo, length: history.length, index: historyIndexRef.current, scene: sceneRef.current, states: history.map((s, i) => ({ i, commandsLen: s.commands.length, commands: s.commands, cursor: s.cursorIndex, sel: s.selection })) });
  }, [snapshotFromRefs]);

  const tryPushUndoState = useCallback((trigger: 'insert' | 'always') => {
    if (trigger === 'insert' && historyFlagRef.current !== 1) {
      /* push는 안 하지만 현재 장면은 진행됨 → scene을 tip(length+1)으로 맞춰 undo 시 idx+1<scene 성립 */
      sceneRef.current = historyRef.current.length + 1;
      return;
    }
    pushHistory(true);
  }, [pushHistory]);

  const undo = useCallback(() => {
    const history = historyRef.current;
    const idx = historyIndexRef.current;
    const scene = sceneRef.current;
    /* idx가 0이어도 flag=1이면 입력 후 커서만 있는 상태이므로 undo 허용 */
    // if (idx <= 0 && historyFlagRef.current === 0) return;
    /* Python: if idx+1==len(history): history.append(scene) */
    if (idx + 1 === history.length) history.push(snapshotFromRefs());
    /* Python: if idx+1<scene: scene=history[idx]; if idx>0: idx-- */
    if (idx + 1 < scene) {
      const s = history[idx];
      /* idx===0(첫 장면)이면 참조 공유 이슈 없이 빈 배열로 확실히 복원 */
      setCommands(idx === 0 ? [] : s.commands.slice());
      setCursorIndexState(s.cursorIndex);
      setSelectionState(s.selection ? { ...s.selection } : null);
      if (idx > 0) historyIndexRef.current = idx - 1;
      sceneRef.current = idx + 1; /* 불러온 장면 위치(1-based) */
    }
    /* undo 후 다음 커맨드 입력 시 저장되도록 */
    historyFlagRef.current = 1;
    console.log('[undo] undo', { length: history.length, index: historyIndexRef.current, scene: sceneRef.current });
  }, [snapshotFromRefs]);

  const redo = useCallback(() => {
    const history = historyRef.current;
    const idx = historyIndexRef.current;
    const scene = sceneRef.current;
    /* Python: if idx+1<scene: if idx+2<l: scene=history[idx+2]; idx++ */
    if (idx + 1 < scene) {
      if (idx + 2 < history.length) {
        const s = history[idx + 2];
        setCommands(s.commands.slice());
        setCursorIndexState(s.cursorIndex);
        setSelectionState(s.selection ? { ...s.selection } : null);
        historyIndexRef.current = idx + 1;
        sceneRef.current = idx + 3; /* 불러온 장면 위치(1-based) */
      }
    } else if (idx + 1 < history.length) {
      /* Python: elif idx+1<l: scene=history[idx+1] (idx 유지) */
      const s = history[idx + 1];
      setCommands(s.commands.slice());
      setCursorIndexState(s.cursorIndex);
      setSelectionState(s.selection ? { ...s.selection } : null);
      sceneRef.current = idx + 2;
    }
    /* redo 후 다음 커맨드 입력 시 저장되도록 */
    historyFlagRef.current = 1;
    console.log('[undo] redo', { length: history.length, index: historyIndexRef.current, scene: sceneRef.current });
  }, []);

  const setCursorIndexInternal = useCallback((value: number | ((prev: number) => number)) => {
    setCursorIndexState((prev) => {
      const next = typeof value === 'function' ? value(prev) : value;
      return Math.max(0, Math.min(commands.length, next));
    });
  }, [commands.length]);

  const setCursorIndex = useCallback((value: number | ((prev: number) => number)) => {
    historyFlagRef.current = 1;
    setCursorIndexInternal(value);
  }, [setCursorIndexInternal]);

  const setSelectionWrapped = useCallback((value: SelectionRange | null) => {
    historyFlagRef.current = 1;
    setSelectionState(value);
  }, []);

  useEffect(() => {
    if (customMapping) {
      keyMapping.current = { ...defaultKeyMapping, ...customMapping };
    }
  }, [customMapping]);

  const insertCommandAtCursor = useCallback((item: CommandItem) => {
    const sel = selectionRef.current;
    const hasSel = sel && sel.start < sel.end;
    if (hasSel) selectionRef.current = null;
    setCommands((prev) => {
      const at = hasSel ? sel!.start : Math.min(cursorIndexRef.current, prev.length);
      const endAt = hasSel ? sel!.end : at;
      return [...prev.slice(0, at), item, ...prev.slice(endAt)];
    });
    const nextCursor = hasSel ? sel!.start + 1 : cursorIndexRef.current + 1;
    setCursorIndexState(nextCursor);
    if (hasSel) setSelectionState(null);
  }, []);

  const addCommand = insertCommandAtCursor;

  const toggleTextMode = useCallback(() => {
    setIsTextMode((prev) => {
      const newMode = !prev;
      if (prev && currentText.trim()) {
        setCommands((c) => {
          const idx = Math.min(cursorIndexRef.current, c.length);
          return [...c.slice(0, idx), { type: 'text', value: currentText.trim() }, ...c.slice(idx)];
        });
        setCursorIndexState((c) => c + 1);
        setCurrentText('');
      }
      pressedKeys.current.clear();
      return newMode;
    });
  }, [currentText]);

  const updateText = useCallback((text: string) => {
    setCurrentText(text);
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const code = event.code;

      if (isTextMode) {
        if (code === 'Enter') {
          const target = event.target as HTMLElement;
          if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
            return;
          }
          toggleTextMode();
          event.preventDefault();
          return;
        }
        if (code === 'Backspace') {
          const target = event.target as HTMLElement;
          if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
            return;
          }
          setCurrentText((prev) => prev.slice(0, -1));
          event.preventDefault();
          return;
        }
        if (code === 'Escape') {
          setTextEditIndex(null);
          setIsTextMode(false);
          setCurrentText('');
          event.preventDefault();
          return;
        }
        return;
      }

      if ((event.ctrlKey || event.metaKey) && code === 'KeyZ') {
        const active = document.activeElement as HTMLElement | null;
        /* INPUT/TEXTAREA에서 텍스트 입력 중일 때만 건너뜀. 그 외(포커스가 다른 곳에 있어도) 항상 undo */
        if (isTextMode && (active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA')) return;
        event.preventDefault();
        undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && code === 'KeyY') {
        const active = document.activeElement as HTMLElement | null;
        if (isTextMode && (active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA')) return;
        event.preventDefault();
        redo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && code === 'KeyA') {
        const active = document.activeElement as HTMLElement | null;
        if (isTextMode && (active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA')) return;
        event.preventDefault();
        historyFlagRef.current = 1;
        const len = commandsLengthRef.current;
        if (len > 0) {
          setSelectionState({ start: 0, end: len });
          setCursorIndexState(len);
        }
        return;
      }
      if ((event.ctrlKey || event.metaKey) && code === 'KeyC') {
        const active = document.activeElement as HTMLElement | null;
        if (isTextMode && (active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA')) return;
        const sel = selectionRef.current;
        const cmds = commandsRef.current;
        if (cmds.length > 0) {
          const toCopy = sel && sel.start < sel.end
            ? cmds.slice(sel.start, sel.end)
            : cmds;
          const text = commandsToCopyText(toCopy);
          if (text) {
            event.preventDefault();
            navigator.clipboard.writeText(text);
          }
        }
        return;
      }
      if ((event.ctrlKey || event.metaKey) && code === 'KeyX') {
        const active = document.activeElement as HTMLElement | null;
        if (isTextMode && (active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA')) return;
        const sel = selectionRef.current;
        const cmds = commandsRef.current;
        if (sel && sel.start < sel.end && cmds.length > 0) {
          event.preventDefault();
          tryPushUndoState('always');
          const toCopy = cmds.slice(sel.start, sel.end);
          const text = commandsToCopyText(toCopy);
          if (text) navigator.clipboard.writeText(text);
          setCommands((prev) => [...prev.slice(0, sel.start), ...prev.slice(sel.end)]);
          setCursorIndexState(sel.start);
          setSelectionState(null);
        }
        return;
      }
      if ((event.ctrlKey || event.metaKey) && code === 'KeyV') {
        const active = document.activeElement as HTMLElement | null;
        if (isTextMode && (active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA')) return;
        event.preventDefault();
        navigator.clipboard.readText().then((text) => {
            const toInsert = parsePasteText(text);
            if (toInsert.length === 0) return;
            tryPushUndoState('always');
            const sel = selectionRef.current;
            const idx = cursorIndexRef.current;
            setCommands((prev) => {
              const hasSel = sel && sel.start < sel.end;
              const at = hasSel ? sel.start : Math.min(idx, prev.length);
              const endAt = hasSel ? sel.end : at;
              return [...prev.slice(0, at), ...toInsert, ...prev.slice(endAt)];
            });
            const newCursor = (sel && sel.start < sel.end ? sel.start : idx) + toInsert.length;
            setCursorIndexState(newCursor);
            setSelectionState(null);
          });
        return;
      }

      if (code === 'Space') {
        if (!event.repeat) {
          tryPushUndoState('insert');
          addCommand({ type: 'notation', value: 'next' });
        }
        event.preventDefault();
        return;
      }

      pressedKeys.current.add(code);

      if (code === 'Enter') {
        toggleTextMode();
        event.preventDefault();
        return;
      }

      if (code === 'Backspace') {
        tryPushUndoState('always');
        const sel = selectionRef.current;
        if (sel && sel.start < sel.end) {
          setCommands((prev) => [...prev.slice(0, sel.start), ...prev.slice(sel.end)]);
          setCursorIndexState(sel.start);
          setSelectionState(null);
        } else {
          setCommands((prev) => {
            const idx = Math.min(cursorIndexRef.current, prev.length);
            if (idx <= 0) return prev;
            return [...prev.slice(0, idx - 1), ...prev.slice(idx)];
          });
          setCursorIndexState((prev) => (prev > 0 ? prev - 1 : 0));
        }
        event.preventDefault();
        return;
      }

      if (code === 'Delete') {
        tryPushUndoState('always');
        const sel = selectionRef.current;
        if (sel && sel.start < sel.end) {
          setCommands((prev) => [...prev.slice(0, sel.start), ...prev.slice(sel.end)]);
          setCursorIndexState(sel.start);
          setSelectionState(null);
        } else {
          setCommands((prev) => {
            const idx = Math.min(cursorIndexRef.current, prev.length);
            if (idx >= prev.length) return prev;
            return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
          });
        }
        event.preventDefault();
        return;
      }

      if (code === 'ArrowLeft') {
        historyFlagRef.current = 1;
        if (event.shiftKey) {
          const cur = cursorIndexRef.current;
          const newCursor = Math.max(0, cur - 1);
          const sel = selectionRef.current;
          if (sel && sel.start < sel.end) {
            const anchor = sel.start + sel.end - cur;
            const newStart = Math.min(newCursor, anchor);
            const newEnd = Math.max(newCursor, anchor);
            setSelectionState(newStart < newEnd ? { start: newStart, end: newEnd } : null);
          } else {
            setSelectionState(newCursor < cur ? { start: newCursor, end: cur } : null);
          }
          setCursorIndexState(newCursor);
        } else {
          setSelectionState(null);
          setCursorIndexState((prev) => Math.max(0, prev - 1));
        }
        event.preventDefault();
        return;
      }
      if (code === 'ArrowRight') {
        historyFlagRef.current = 1;
        if (event.shiftKey) {
          const len = commandsLengthRef.current;
          const cur = cursorIndexRef.current;
          const newCursor = Math.min(len, cur + 1);
          const sel = selectionRef.current;
          if (sel && sel.start < sel.end) {
            const anchor = sel.start + sel.end - cur;
            const newStart = Math.min(newCursor, anchor);
            const newEnd = Math.max(newCursor, anchor);
            setSelectionState(newStart < newEnd ? { start: newStart, end: newEnd } : null);
          } else {
            setSelectionState(newCursor > cur ? { start: cur, end: newCursor } : null);
          }
          setCursorIndexState(newCursor);
        } else {
          setSelectionState(null);
          setCursorIndexState((prev) => Math.min(commandsLengthRef.current, prev + 1));
        }
        event.preventDefault();
        return;
      }
      if (code === 'ArrowDown') {
        historyFlagRef.current = 1;
        const len = commandsLengthRef.current;
        const cur = cursorIndexRef.current;
        const pos = slotPositionsRef?.current;
        let newCursor: number;
        if (pos?.tops.length && pos?.lefts.length && cur < pos.tops.length) {
          const j = findSlotRowBelow(pos.tops, pos.lefts, cur);
          newCursor = j >= 0 ? j : Math.min(len, cur + DEFAULT_SLOTS_PER_ROW);
        } else {
          newCursor = Math.min(len, cur + DEFAULT_SLOTS_PER_ROW);
        }
        if (event.shiftKey) {
          const sel = selectionRef.current;
          if (sel && sel.start < sel.end) {
            const anchor = sel.start + sel.end - cur;
            const newStart = Math.min(newCursor, anchor);
            const newEnd = Math.max(newCursor, anchor);
            setSelectionState(newStart < newEnd ? { start: newStart, end: newEnd } : null);
          } else {
            setSelectionState(newCursor > cur ? { start: cur, end: newCursor } : null);
          }
          setCursorIndexState(newCursor);
        } else {
          setSelectionState(null);
          setCursorIndexState(newCursor);
        }
        event.preventDefault();
        return;
      }

      if (code === 'ArrowUp') {
        historyFlagRef.current = 1;
        const cur = cursorIndexRef.current;
        const pos = slotPositionsRef?.current;
        let newCursor: number;
        if (pos?.tops.length && pos?.lefts.length && cur < pos.tops.length) {
          const j = findSlotRowAbove(pos.tops, pos.lefts, cur);
          newCursor = j >= 0 ? j : Math.max(0, cur - DEFAULT_SLOTS_PER_ROW);
        } else {
          newCursor = Math.max(0, cur - DEFAULT_SLOTS_PER_ROW);
        }
        if (event.shiftKey) {
          const sel = selectionRef.current;
          if (sel && sel.start < sel.end) {
            const anchor = sel.start + sel.end - cur;
            const newStart = Math.min(newCursor, anchor);
            const newEnd = Math.max(newCursor, anchor);
            setSelectionState(newStart < newEnd ? { start: newStart, end: newEnd } : null);
          } else {
            setSelectionState(newCursor < cur ? { start: newCursor, end: cur } : null);
          }
          setCursorIndexState(newCursor);
        } else {
          setSelectionState(null);
          setCursorIndexState(newCursor);
        }
        event.preventDefault();
        return;
      }

      if (code === 'Home') {
        const active = document.activeElement as HTMLElement | null;
        if (isTextMode && (active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA')) return;
        historyFlagRef.current = 1;
        if (event.shiftKey) {
          const cur = cursorIndexRef.current;
          setSelectionState(cur > 0 ? { start: 0, end: cur } : null);
        } else {
          setSelectionState(null);
        }
        setCursorIndexState(0);
        event.preventDefault();
        return;
      }
      if (code === 'End') {
        const active = document.activeElement as HTMLElement | null;
        if (isTextMode && (active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA')) return;
        historyFlagRef.current = 1;
        const len = commandsLengthRef.current;
        if (event.shiftKey) {
          const cur = cursorIndexRef.current;
          setSelectionState(cur < len ? { start: cur, end: len } : null);
        } else {
          setSelectionState(null);
        }
        setCursorIndexState(len);
        event.preventDefault();
        return;
      }

      if (!event.repeat) {
        const key = event.key;
        if (code === 'BracketLeft' || key === '[') {
          tryPushUndoState('insert');
          addCommand({ type: 'notation', value: 'bracketl' });
          event.preventDefault();
          return;
        }
        if (code === 'BracketRight' || key === ']') {
          tryPushUndoState('insert');
          addCommand({ type: 'notation', value: 'bracketr' });
          event.preventDefault();
          return;
        }
        if (key === '(') {
          tryPushUndoState('insert');
          addCommand({ type: 'notation', value: 'parenl' });
          event.preventDefault();
          return;
        }
        if (key === ')') {
          tryPushUndoState('insert');
          addCommand({ type: 'notation', value: 'parenr' });
          event.preventDefault();
          return;
        }
        if (key === '~' || (code === 'Backquote' && event.shiftKey)) {
          tryPushUndoState('insert');
          addCommand({ type: 'notation', value: 'tilde' });
          event.preventDefault();
          return;
        }
        if (code === 'Backslash' || key === '\\') {
          tryPushUndoState('always');
          addCommand({ type: 'notation', value: 'linebreak' });
          event.preventDefault();
          return;
        }
      }
    },
    [isTextMode, toggleTextMode, addCommand, tryPushUndoState, undo, redo, slotPositionsRef]
  );

  const handleKeyUp = useCallback((event: KeyboardEvent) => {
    pressedKeys.current.delete(event.code);
  }, []);

  // 60fps 프레임 루프: 방향(단일/대각선/홀드), 버튼, 특수 매 프레임 샘플링
  useEffect(() => {
    let last = performance.now();
    let rafId = 0;

    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick);
      const elapsed = now - last;
      if (elapsed < FRAME_MS) return;
      last = now;

      if (isTextMode) return;

      const mapping = keyMapping.current;
      const keys = new Set(pressedKeys.current);
      const dir = findDirectionFromKeys(keys, mapping);
      const btn = findButtonFromKeys(keys, mapping);
      const special = findSpecialFromKeys(keys, mapping);

      const toAdd: CommandItem[] = [];

      if (dir !== prevDirection.current) {
        prevDirection.current = dir;
        framesHeld.current = 0;
        if (dir) {
          toAdd.push({ type: 'direction', value: dir });
          framesHeld.current = 1;
        }
      } else if (dir && dir !== 'n') {
        framesHeld.current += 1;
        if (framesHeld.current === HOLD_FRAME_THRESHOLD) {
          const hold = toHoldNotation(dir);
          if (hold) toAdd.push({ type: 'direction', value: hold });
        }
      }

      if (btn !== prevButton.current) {
        prevButton.current = btn;
        if (btn) toAdd.push({ type: 'button', value: btn });
      }

      if (special !== prevSpecial.current) {
        prevSpecial.current = special;
        if (special) {
          if (special === 'heat') {
            const now = Date.now();
            const idx = cursorIndexRef.current;
            const prevCmd = idx > 0 ? commandsRef.current[idx - 1] : null;
            const isDoublePress =
              lastHeatPressTimeRef.current > 0 &&
              now - lastHeatPressTimeRef.current < HEAT_DOUBLE_PRESS_MS;
            const willReplaceHeatWithSmash =
              isDoublePress &&
              prevCmd?.type === 'special' &&
              prevCmd.value === 'heat';
            toAdd.push({
              type: 'special',
              value: isDoublePress ? 'heatSmash' : 'heat',
            });
            didReplaceHeatWithSmashRef.current = !!willReplaceHeatWithSmash;
            lastHeatPressTimeRef.current = willReplaceHeatWithSmash ? 0 : now;
          } else {
            toAdd.push({ type: 'special', value: special });
          }
        }
      }

      if (toAdd.length > 0) {
        tryPushUndoState('insert');
        const sel = selectionRef.current;
        const hasSel = sel && sel.start < sel.end;
        if (hasSel) selectionRef.current = null;
        const idx = cursorIndexRef.current;
        didReplaceWithHoldRef.current = false;
        const replaceHeatWithSmash =
          didReplaceHeatWithSmashRef.current &&
          toAdd.length === 1 &&
          toAdd[0].type === 'special' &&
          toAdd[0].value === 'heatSmash';
        const holdItem = toAdd.length === 1 && toAdd[0].type === 'direction' ? toAdd[0] as { type: 'direction'; value: string } : null;
        const onlyHold = holdItem && holdItem.value.endsWith('hold');
        const holdBase = onlyHold ? holdItem.value.replace(/hold$/, '') : '';
        setCommands((prev) => {
          const at = hasSel ? sel!.start : Math.min(idx, prev.length);
          const endAt = hasSel ? sel!.end : at;
          if (replaceHeatWithSmash && at > 0) {
            const p = prev[at - 1];
            if (p.type === 'special' && p.value === 'heat') {
              return [...prev.slice(0, at - 1), toAdd[0], ...prev.slice(endAt)];
            }
          }
          if (onlyHold && at > 0) {
            const prevCmd = prev[at - 1];
            const prevIsSameDirTap =
              prevCmd.type === 'direction' &&
              !(prevCmd.value as string).endsWith('hold') &&
              (prevCmd.value as string) === holdBase;
            if (prevIsSameDirTap) {
              didReplaceWithHoldRef.current = true;
              return [...prev.slice(0, at - 1), toAdd[0], ...prev.slice(endAt)];
            }
          }
          return [...prev.slice(0, at), ...toAdd, ...prev.slice(endAt)];
        });
        setSelectionState(null);
        if (didReplaceWithHoldRef.current || replaceHeatWithSmash) {
          const insertAt = hasSel ? sel!.start : idx;
          cursorIndexRef.current = insertAt;
          setCursorIndexState(insertAt);
        } else {
          const nextCursor = hasSel
            ? sel!.start + toAdd.length
            : Math.min(idx, commandsRef.current.length) + toAdd.length;
          cursorIndexRef.current = nextCursor;
          setCursorIndexState(nextCursor);
        }
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isTextMode, tryPushUndoState]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  const selectAll = useCallback(() => {
    const len = commandsLengthRef.current;
    if (len > 0) {
      setSelectionState({ start: 0, end: len });
      setCursorIndexState(len);
    }
  }, []);

  const clearCommands = useCallback(() => {
    tryPushUndoState('always');
    setCommands([]);
    setCursorIndexState(0);
    setSelectionState(null);
    setCurrentText('');
    setIsTextMode(false);
    prevDirection.current = null;
    framesHeld.current = 0;
    prevButton.current = null;
    prevSpecial.current = null;
  }, [tryPushUndoState]);

  const removeLastCommand = useCallback(() => {
    setCommands((prev) => prev.slice(0, -1));
    setCursorIndexState((prev) => Math.max(0, prev - 1));
  }, []);

  /** 텍스트 입력 완료: 커서 위치에 삽입 또는 지정 인덱스 항목 교체 후 텍스트 모드 종료 */
  const finishTextInput = useCallback(
    (value: string) => {
      tryPushUndoState('always');
      const trimmed = value.trim();
      const editingAt = textEditIndexRef.current;
      if (editingAt !== null) {
        if (trimmed) {
          setCommands((prev) =>
            prev.map((cmd, i) =>
              i === editingAt ? { type: 'text' as const, value: trimmed } : cmd
            )
          );
        }
        setTextEditIndex(null);
      } else if (trimmed) {
        setCommands((prev) => {
          const idx = Math.min(cursorIndexRef.current, prev.length);
          return [...prev.slice(0, idx), { type: 'text', value: trimmed }, ...prev.slice(idx)];
        });
        setCursorIndexState((prev) => prev + 1);
      }
      setCurrentText('');
      pressedKeys.current.clear();
      setIsTextMode(false);
    },
    [tryPushUndoState]
  );

  useEffect(() => {
    textEditIndexRef.current = textEditIndex;
  }, [textEditIndex]);

  /** 텍스트 커맨드 더블클릭 시 해당 항목 수정 모드로 전환 */
  const startTextEdit = useCallback((index: number) => {
    const cmd = commandsRef.current[index];
    if (cmd?.type === 'text') {
      setCurrentText(cmd.value);
      setTextEditIndex(index);
      setIsTextMode(true);
    }
  }, []);

  const copyToClipboard = useCallback(() => {
    const sel = selectionRef.current;
    const cmds = commandsRef.current;
    if (cmds.length === 0) return;
    const toCopy = sel && sel.start < sel.end ? cmds.slice(sel.start, sel.end) : cmds;
    const text = commandsToCopyText(toCopy);
    if (text) navigator.clipboard.writeText(text);
  }, []);

  const cutToClipboard = useCallback(() => {
    const sel = selectionRef.current;
    const cmds = commandsRef.current;
    if (!sel || sel.start >= sel.end || cmds.length === 0) return;
    tryPushUndoState('always');
    const toCopy = cmds.slice(sel.start, sel.end);
    const text = commandsToCopyText(toCopy);
    if (text) navigator.clipboard.writeText(text);
    setCommands((prev) => [...prev.slice(0, sel.start), ...prev.slice(sel.end)]);
    setCursorIndexState(sel.start);
    setSelectionState(null);
  }, [tryPushUndoState]);

  const pasteFromClipboard = useCallback(async () => {
    const text = await navigator.clipboard.readText();
    const toInsert = parsePasteText(text);
    if (toInsert.length === 0) return;
    tryPushUndoState('always');
    const sel = selectionRef.current;
    const idx = cursorIndexRef.current;
    setCommands((prev) => {
      const hasSel = sel && sel.start < sel.end;
      const at = hasSel ? sel.start : Math.min(idx, prev.length);
      const endAt = hasSel ? sel.end : at;
      return [...prev.slice(0, at), ...toInsert, ...prev.slice(endAt)];
    });
    const newCursor = (sel && sel.start < sel.end ? sel.start : idx) + toInsert.length;
    setCursorIndexState(newCursor);
    setSelectionState(null);
  }, [tryPushUndoState]);

  /** 선택 해제 후 커서를 맨 끝으로 이동 (빈 영역 클릭 등) */
  const clearSelectionAndMoveCursorToEnd = useCallback(() => {
    setSelectionState(null);
    setCursorIndexState(commandsRef.current.length);
  }, []);

  return {
    commands,
    cursorIndex,
    setCursorIndex,
    selection,
    setSelection: setSelectionWrapped,
    selectAll,
    copyToClipboard,
    cutToClipboard,
    pasteFromClipboard,
    isTextMode,
    textEditIndex,
    currentText,
    addCommand,
    clearCommands,
    removeLastCommand,
    toggleTextMode,
    finishTextInput,
    updateText,
    startTextEdit,
    clearSelectionAndMoveCursorToEnd,
    undo,
    redo,
  };
}
