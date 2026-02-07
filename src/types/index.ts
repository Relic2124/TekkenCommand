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

/** 괄호 등 단일 노테이션 이미지 ([, ] Space 등) */
export type NotationImage = 'bracketl' | 'bracketr' | 'next';

export type CommandItem =
  | { type: 'direction'; value: DirectionNotation }
  | { type: 'button'; value: ButtonNotation }
  | { type: 'special'; value: SpecialNotation }
  | { type: 'notation'; value: NotationImage }
  | { type: 'text'; value: string };

/** 키 매핑: 방향은 u,d,f,b만 저장, 대각선(ub,uf,db,df)은 조합으로 계산 */
export interface KeyMapping {
  directions: {
    u: string[];
    d: string[];
    f: string[];
    b: string[];
    n: string[];
  };
  buttons: Record<string, string[]>;
  special: {
    heat: string[];
    rage: string[];
  };
}
