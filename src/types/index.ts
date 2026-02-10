/** 이동 커맨드: u,d,f,b, ub,uf,db,df, n (홀드 포함) */
export type DirectionNotation =
  | 'u' | 'd' | 'f' | 'b'
  | 'ub' | 'uf' | 'db' | 'df'
  | 'n'
  | 'uhold' | 'dhold' | 'fhold' | 'bhold'
  | 'ubhold' | 'ufhold' | 'dbhold' | 'dfhold';

/** 공격 커맨드: 1,2,3,4 및 동시입력 */
export type ButtonNotation =
  | '1' | '2' | '3' | '4'
  | '1+2' | '1+3' | '1+4' | '2+3' | '2+4' | '3+4'
  | '1+2+3' | '1+2+4' | '1+3+4' | '2+3+4' | '1+2+3+4';

/** 특수: heat burst, heat smash, rage art */
export type SpecialNotation = 'heat' | 'heatSmash' | 'rage';

/** 괄호·물결표·줄바꿈 등 단일 노테이션 ([, ], (, ), ~, next, linebreak) */
export type NotationImage = 'bracketl' | 'bracketr' | 'parenl' | 'parenr' | 'next' | 'tilde' | 'linebreak';

export type CommandItem =
  | { type: 'direction'; value: DirectionNotation }
  | { type: 'button'; value: ButtonNotation }
  | { type: 'special'; value: SpecialNotation }
  | { type: 'notation'; value: NotationImage }
  | { type: 'text'; value: string };

/** 노테이션 입력(▶, [, ], (, ), ~, ↵)에 매핑할 키 코드 */
export type NotationMappingKey = 'next' | 'bracketl' | 'bracketr' | 'parenl' | 'parenr' | 'tilde' | 'linebreak';

/** 키 매핑: 방향 u,d,f,b,n + 선택적 대각선(ub,uf,db,df) 전용 키 + 노테이션 */
export interface KeyMapping {
  directions: {
    u: string[];
    d: string[];
    f: string[];
    b: string[];
    n: string[];
    ub?: string[];
    uf?: string[];
    db?: string[];
    df?: string[];
  };
  buttons: Record<string, string[]>;
  special: {
    heat: string[];
    rage: string[];
  };
  /** ▶ next, [ ] ( ) ~ ↵ 줄바꿈 등 노테이션 입력 키. 비어 있으면 기본 키(문자) 사용 */
  notation?: Partial<Record<NotationMappingKey, string[]>>;
}
