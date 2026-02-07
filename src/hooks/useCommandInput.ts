import { useState, useEffect, useCallback, useRef } from 'react';
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

export function useCommandInput(customMapping?: Partial<KeyMapping>) {
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
      const start = Math.min(sel.start, commands.length);
      const end = Math.min(sel.end, commands.length);
      return start < end ? { start, end } : null;
    });
  }, [commands.length, commands]);

  const setCursorIndex = useCallback((value: number | ((prev: number) => number)) => {
    setCursorIndexState((prev) => {
      const next = typeof value === 'function' ? value(prev) : value;
      return Math.max(0, Math.min(commands.length, next));
    });
  }, [commands.length]);

  useEffect(() => {
    if (customMapping) {
      keyMapping.current = { ...defaultKeyMapping, ...customMapping };
    }
  }, [customMapping]);

  const insertCommandAtCursor = useCallback((item: CommandItem) => {
    setCommands((prev) => {
      const idx = Math.min(cursorIndexRef.current, prev.length);
      return [...prev.slice(0, idx), item, ...prev.slice(idx)];
    });
    setCursorIndexState((prev) => prev + 1);
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

      if ((event.ctrlKey || event.metaKey) && code === 'KeyA') {
        const active = document.activeElement as HTMLElement | null;
        if (active?.closest?.('.input-area')) {
          if (isTextMode && active.tagName === 'INPUT') return;
          event.preventDefault();
          const len = commandsLengthRef.current;
          if (len > 0) {
            setSelectionState({ start: 0, end: len });
            setCursorIndexState(len);
          }
          return;
        }
      }
      if ((event.ctrlKey || event.metaKey) && code === 'KeyC') {
        const active = document.activeElement as HTMLElement | null;
        if (active?.closest?.('.input-area') && !(isTextMode && active.tagName === 'INPUT')) {
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
      }
      if ((event.ctrlKey || event.metaKey) && code === 'KeyX') {
        const active = document.activeElement as HTMLElement | null;
        if (active?.closest?.('.input-area') && !(isTextMode && active.tagName === 'INPUT')) {
          const sel = selectionRef.current;
          const cmds = commandsRef.current;
          if (sel && sel.start < sel.end && cmds.length > 0) {
            event.preventDefault();
            const toCopy = cmds.slice(sel.start, sel.end);
            const text = commandsToCopyText(toCopy);
            if (text) navigator.clipboard.writeText(text);
            setCommands((prev) => [...prev.slice(0, sel.start), ...prev.slice(sel.end)]);
            setCursorIndexState(sel.start);
            setSelectionState(null);
          }
          return;
        }
      }
      if ((event.ctrlKey || event.metaKey) && code === 'KeyV') {
        const active = document.activeElement as HTMLElement | null;
        if (active?.closest?.('.input-area') && !(isTextMode && active.tagName === 'INPUT')) {
          event.preventDefault();
          navigator.clipboard.readText().then((text) => {
            const toInsert = parsePasteText(text);
            if (toInsert.length === 0) return;
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
      }

      if (code === 'Space') {
        if (!event.repeat) addCommand({ type: 'notation', value: 'next' });
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

      if (!event.repeat) {
        const key = event.key;
        if (code === 'BracketLeft' || key === '[') {
          addCommand({ type: 'notation', value: 'bracketl' });
          event.preventDefault();
          return;
        }
        if (code === 'BracketRight' || key === ']') {
          addCommand({ type: 'notation', value: 'bracketr' });
          event.preventDefault();
          return;
        }
        if (key === '(') {
          addCommand({ type: 'notation', value: 'parenl' });
          event.preventDefault();
          return;
        }
        if (key === ')') {
          addCommand({ type: 'notation', value: 'parenr' });
          event.preventDefault();
          return;
        }
        if (key === '~' || (code === 'Backquote' && event.shiftKey)) {
          addCommand({ type: 'notation', value: 'tilde' });
          event.preventDefault();
          return;
        }
      }
    },
    [isTextMode, toggleTextMode, addCommand]
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
          const at = Math.min(idx, prev.length);
          if (replaceHeatWithSmash && at > 0) {
            const p = prev[at - 1];
            if (p.type === 'special' && p.value === 'heat') {
              return [...prev.slice(0, at - 1), toAdd[0], ...prev.slice(at)];
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
              return [...prev.slice(0, at - 1), toAdd[0], ...prev.slice(at)];
            }
          }
          return [...prev.slice(0, at), ...toAdd, ...prev.slice(at)];
        });
        setSelectionState(null);
        if (didReplaceWithHoldRef.current || replaceHeatWithSmash) {
          cursorIndexRef.current = idx;
          setCursorIndexState(idx);
        } else {
          cursorIndexRef.current = idx + toAdd.length;
          setCursorIndexState(cursorIndexRef.current);
        }
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isTextMode]);

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
    setCommands([]);
    setCursorIndexState(0);
    setSelectionState(null);
    setCurrentText('');
    setIsTextMode(false);
    prevDirection.current = null;
    framesHeld.current = 0;
    prevButton.current = null;
    prevSpecial.current = null;
  }, []);

  const removeLastCommand = useCallback(() => {
    setCommands((prev) => prev.slice(0, -1));
    setCursorIndexState((prev) => Math.max(0, prev - 1));
  }, []);

  /** 텍스트 입력 완료: 커서 위치에 삽입 또는 지정 인덱스 항목 교체 후 텍스트 모드 종료 */
  const finishTextInput = useCallback(
    (value: string) => {
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
    []
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
    const toCopy = cmds.slice(sel.start, sel.end);
    const text = commandsToCopyText(toCopy);
    if (text) navigator.clipboard.writeText(text);
    setCommands((prev) => [...prev.slice(0, sel.start), ...prev.slice(sel.end)]);
    setCursorIndexState(sel.start);
    setSelectionState(null);
  }, []);

  const pasteFromClipboard = useCallback(async () => {
    const text = await navigator.clipboard.readText();
    const toInsert = parsePasteText(text);
    if (toInsert.length === 0) return;
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
  }, []);

  return {
    commands,
    cursorIndex,
    setCursorIndex,
    selection,
    setSelection: setSelectionState,
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
  };
}
