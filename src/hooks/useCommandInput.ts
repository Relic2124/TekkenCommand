import { useState, useEffect, useCallback, useRef } from 'react';
import type { CommandItem, KeyMapping, DirectionNotation } from '../types/index.js';
import {
  defaultKeyMapping,
  findDirectionFromKeys,
  findButtonFromKeys,
  findSpecialFromKeys,
} from '../utils/keyMapping.js';

const FPS = 60;
const FRAME_MS = 1000 / FPS;

/** 방향에 hold 접미사 (n이면 null) */
function toHoldNotation(dir: DirectionNotation | null): DirectionNotation | null {
  if (!dir || dir === 'n') return null;
  if (dir.endsWith('hold')) return dir;
  const base = dir.replace(/hold$/, '');
  return (base + 'hold') as DirectionNotation;
}

export function useCommandInput(customMapping?: Partial<KeyMapping>) {
  const [commands, setCommands] = useState<CommandItem[]>([]);
  const [cursorIndex, setCursorIndexState] = useState(0);
  const cursorIndexRef = useRef(0);
  const commandsLengthRef = useRef(0);
  const [isTextMode, setIsTextMode] = useState(false);
  const [currentText, setCurrentText] = useState('');
  const pressedKeys = useRef<Set<string>>(new Set());
  const keyMapping = useRef<KeyMapping>({ ...defaultKeyMapping, ...customMapping });

  const prevDirection = useRef<DirectionNotation | null>(null);
  const framesHeld = useRef<number>(0);
  const prevButton = useRef<string | null>(null);
  const prevSpecial = useRef<'heat' | 'rage' | null>(null);

  const HOLD_FRAME_THRESHOLD = 10;

  useEffect(() => {
    cursorIndexRef.current = cursorIndex;
  }, [cursorIndex]);

  useEffect(() => {
    commandsLengthRef.current = commands.length;
    setCursorIndexState((prev) => Math.min(prev, commands.length));
  }, [commands.length]);

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
          setCurrentText((prev) => prev.slice(0, -1));
          event.preventDefault();
          return;
        }
        if (code === 'Escape') {
          setIsTextMode(false);
          setCurrentText('');
          event.preventDefault();
          return;
        }
        return;
      }

      if (code === 'ShiftLeft' || code === 'ShiftRight') {
        if (!event.repeat) addCommand({ type: 'direction', value: 'n' });
        event.preventDefault();
        return;
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
        setCommands((prev) => {
          const idx = Math.min(cursorIndexRef.current, prev.length);
          if (idx <= 0) return prev;
          return [...prev.slice(0, idx - 1), ...prev.slice(idx)];
        });
        setCursorIndexState((prev) => (prev > 0 ? prev - 1 : 0));
        event.preventDefault();
        return;
      }

      if (code === 'Delete') {
        setCommands((prev) => {
          const idx = Math.min(cursorIndexRef.current, prev.length);
          if (idx >= prev.length) return prev;
          return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
        });
        event.preventDefault();
        return;
      }

      if (code === 'ArrowLeft') {
        setCursorIndexState((prev) => Math.max(0, prev - 1));
        event.preventDefault();
        return;
      }
      if (code === 'ArrowRight') {
        setCursorIndexState((prev) => Math.min(commandsLengthRef.current, prev + 1));
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
        if (special) toAdd.push({ type: 'special', value: special });
      }

      if (toAdd.length > 0) {
        const idx = cursorIndexRef.current;
        setCommands((prev) => {
          const at = Math.min(idx, prev.length);
          return [...prev.slice(0, at), ...toAdd, ...prev.slice(at)];
        });
        cursorIndexRef.current = idx + toAdd.length;
        setCursorIndexState(cursorIndexRef.current);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isTextMode]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  const clearCommands = useCallback(() => {
    setCommands([]);
    setCursorIndexState(0);
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

  /** 텍스트 입력 완료: 커서 위치에 텍스트 삽입 후 텍스트 모드 종료 */
  const finishTextInput = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (trimmed) {
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

  return {
    commands,
    cursorIndex,
    setCursorIndex,
    isTextMode,
    currentText,
    addCommand,
    clearCommands,
    removeLastCommand,
    toggleTextMode,
    finishTextInput,
    updateText,
  };
}
