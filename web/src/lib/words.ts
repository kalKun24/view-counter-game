/**
 * 同じワードの組み合わせを判定するキー。
 * NFKC 正規化（全角英数・全角スペースを半角に）→ 小文字化 → 空白で分割 → 並べ替え → 連結。
 * 試作版の normWords に NFKC を足したもの。
 */
export const normKey = (q: string): string =>
  q
    .normalize("NFKC")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
