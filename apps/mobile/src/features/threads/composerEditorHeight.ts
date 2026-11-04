/**
 * The editor reports its text height at the width it is laid out in. Text that
 * wraps in the narrow compact slot overstates the full-width editor it expands
 * into, so the composer would grow past its final height and shrink back.
 */
export function rescaleEditorContentHeight(input: {
  readonly contentHeight: number;
  readonly lineHeight: number;
  readonly measuredWidth: number;
  readonly width: number;
}): number {
  const { contentHeight, lineHeight, measuredWidth, width } = input;
  if (measuredWidth <= 0 || width <= 0 || measuredWidth === width) return contentHeight;
  const lines = Math.round(contentHeight / lineHeight);
  if (lines <= 1) return contentHeight;
  // Only the full lines are known to be filled; a short last line may fit on the
  // line above. Erring low lets a later measurement grow the editor, never shrink it.
  return Math.max(1, Math.ceil(((lines - 1) * measuredWidth) / width)) * lineHeight;
}

/**
 * Text that lands in one chunk (paste, dictation) reaches JS before the editor
 * re-measures it. Estimate its width from the last single-line measurement so
 * the composer can take its expanded layout in the same frame as the text.
 */
export function estimateUnmeasuredEditorText(input: {
  readonly text: string;
  readonly charWidth: number;
  readonly compactWidth: number;
  readonly expandedWidth: number;
  readonly lineHeight: number;
}): { readonly overflowsCompact: boolean; readonly height: number } {
  const { text, charWidth, compactWidth, expandedWidth, lineHeight } = input;
  const width = text.length * charWidth;
  const overflowsCompact = text.includes("\n") || (compactWidth > 0 && width > compactWidth);
  // No line holds more than its width, so this is a lower bound when the char width is right.
  const lines =
    expandedWidth > 0 ? Math.max(1, text.split("\n").length, Math.ceil(width / expandedWidth)) : 1;
  return { overflowsCompact, height: lines * lineHeight };
}
