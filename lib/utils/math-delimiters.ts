/** `\(...\)` and `\[...\]` as `$...$` and `$$...$$`, the only delimiters the math plugin reads. */
export function normalizeMathDelimiters(text: string): string {
  return text
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, body: string) => `$$${body}$$`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, body: string) => `$${body}$`);
}
