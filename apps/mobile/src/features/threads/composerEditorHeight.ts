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
