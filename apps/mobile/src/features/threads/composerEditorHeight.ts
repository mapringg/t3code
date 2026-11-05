/**
 * Text that lands in one chunk (paste, dictation) reaches JS before the editor
 * re-measures it. Estimate its width from the last single-line measurement so
 * the composer can grow to its final height in the same frame as the text.
 */
export function estimateUnmeasuredEditorText(input: {
  readonly text: string;
  readonly charWidth: number;
  readonly width: number;
  readonly lineHeight: number;
}): { readonly wraps: boolean; readonly height: number } {
  const { text, charWidth, width, lineHeight } = input;
  const textWidth = text.length * charWidth;
  const wraps = text.includes("\n") || (width > 0 && textWidth > width);
  // No line holds more than its width, so this is a lower bound when the char width is right.
  const lines = width > 0 ? Math.max(1, text.split("\n").length, Math.ceil(textWidth / width)) : 1;
  return { wraps, height: lines * lineHeight };
}
