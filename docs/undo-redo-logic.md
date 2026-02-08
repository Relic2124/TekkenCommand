# Undo/Redo 로직 (useCommandInput)

## 1. 모델

- **history**에는 **현재 장면은 넣지 않고**, 그 이전까지 저장된 장면만 들어 있다.
- **idx**는 “저장된 장면” 중 하나의 인덱스. 지금 화면이 아니라 **저장된 장면을 가리킨다.**
- **scene**은 현재 장면 위치(1-based). tip일 때 `scene = length + 1`.

예: scene=4, history=[S1, S2, S3], length=3이면 idx=2 (마지막 저장 S3을 가리킴).

---

## 2. 상태 (변수 4개)

| 이름 | 의미 |
|------|------|
| **history** | 저장된 상태 스냅샷 배열. 초기 `[{ ...initialHistoryState, commands: [] }]` 한 칸. |
| **idx** | 저장된 장면 인덱스(0-based). “이전 저장”을 가리킴. |
| **scene** | 현재 장면 위치(1-based). tip일 때 `scene = length + 1`. |
| **flag** | `0`: 일반 / `1`: 방금 커서 또는 선택이 바뀜. |

스냅샷 하나 = `{ commands, cursorIndex, selection }`.

---

## 3. Push 규칙 (tryPushUndoState)

- **flag=1일 때만 push**
  - Space, `[` `]` `(` `)` `~`, rAF(방향/버튼/특수).
  - 커서/선택을 바꾼 뒤에만 “이번 입력” 전 상태를 저장.

- **flag와 관계없이 항상 push**
  - finishTextInput, Backspace, Delete, paste, cut, clearCommands, linebreak(`\`).

- **flag=0으로 입력했을 때**
  - push는 하지 않지만, 장면은 진행된 것으로 간주.
  - `sceneRef.current = historyRef.current.length + 1` 로 갱신하여, 이후 undo 시 `idx+1 < scene`이 성립하도록 함.

---

## 4. pushHistory(truncateRedo)

- `truncateRedo === true` → redo 분기 제거: `history.length = idx + 1`
- 현재 스냅샷을 **배열 맨 끝에 push**
- `idx = history.length - 1`
- HISTORY_MAX 초과 시 앞에서 shift, idx 보정
- `flag = 0`
- **scene = history.length + 1** (tip이므로)

일반 입력/편집 시에만 `pushHistory(true)` 호출. undo 시에는 pushHistory를 쓰지 않고, undo 내부에서 조건에 따라 push만 함.

---

## 5. Undo

- **조건:** `idx + 1 < scene` 일 때만 “이전 장면”으로 복원 (차이가 2 이상이어야 idx 변경 가능).

동작:

1. `idx + 1 === history.length` 이면 **현재 상태를 push** (맨 처음 undo일 때만 length+1).
2. `idx + 1 < scene` 이면:
   - **scene = history[idx]** 로 복원 (저장된 이전 장면 불러오기).
   - `idx > 0` 이면 **idx--** (그 이전 저장을 가리킴).
   - **scene = idx + 1** (불러온 장면 위치, 1-based).
   - 복원 시 `idx === 0` 이면 `setCommands([])` 로 빈 배열을 명시해 참조 이슈 방지.

---

## 6. Redo

- **차이 2** (`idx + 1 < scene` 이고 `idx + 2 < length`):
  - **scene = history[idx+2]** 로 복원.
  - **idx++**
  - **scene = idx + 3** (불러온 장면이 3번째이므로).

- **차이 1** (`idx + 1 < length` 이고 위 조건 아님):
  - **scene = history[idx+1]** 로 복원.
  - idx 유지.
  - **scene = idx + 2**.

- redo 직후 **flag = 1** 로 두어, 다음 커맨드 입력 시 push되도록 함.

---

## 7. 요약

| 동작 | length | idx | scene |
|------|--------|-----|--------|
| pushHistory (일반 입력) | +1 | = length - 1 | = length + 1 |
| tryPushUndoState('insert'), flag=0 | 유지 | 유지 | = length + 1 |
| Undo (idx+1===length) | +1 | 유지 후 복원 시 idx-- | = idx + 1 |
| Undo (idx+1<scene) 복원 | 유지 | idx - 1 (단 idx>0) | = idx + 1 |
| Redo (차이 2) | 유지 | +1 | = idx + 3 |
| Redo (차이 1) | 유지 | 유지 | = idx + 2 |

---

## 8. 초기값·특수 처리

- **초기 history:** `[{ ...initialHistoryState, commands: [] }]` 로 **commands를 새 배열**로 두어, history[0].commands 참조 공유로 인한 복원 오류를 막음.
- **redo 후:** `historyFlagRef.current = 1` 로 설정해, 그 다음 입력에서 push가 일어나도록 함.
