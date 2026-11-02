// Row heights a feed measured on an earlier visit. LegendList reads them as estimates, so a
// re-open renders only the rows that fill the viewport and lands at the end in one pass.
// Scope by row geometry: heights measured at another width or text size are wrong.
export function createThreadFeedRowSizeMemory(limit: number) {
  const scopes = new Map<string, Map<string, number>>();
  return (scope: string): Map<string, number> => {
    const sizes = scopes.get(scope) ?? new Map<string, number>();
    scopes.delete(scope);
    scopes.set(scope, sizes);
    for (const oldest of scopes.keys()) {
      if (scopes.size <= limit) break;
      scopes.delete(oldest);
    }
    return sizes;
  };
}

export const rememberedThreadFeedRowSizes = createThreadFeedRowSizeMemory(24);
