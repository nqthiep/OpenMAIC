/**
 * CSP nhúng sẵn trong HTML walkthrough (ARCHITECTURE §6, ADR 0010 L5).
 * Widget tự chứa hoàn toàn: không mạng, không tải ngoài, chỉ script/style inline.
 */
export const WALKTHROUGH_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'";

/** Thẻ `<meta>` CSP; `WALKTHROUGH_CSP` không có `& < > "` nên không cần thoát. */
export function cspMetaTag(): string {
  return `<meta http-equiv="Content-Security-Policy" content="${WALKTHROUGH_CSP}">`;
}
