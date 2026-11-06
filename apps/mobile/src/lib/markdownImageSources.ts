import { parseMarkdownDocument, type MarkdownNode } from "./markdownDocument";

// Feed rows remount as the list recycles them; a full parse per mount drops frames while scrolling.
const CACHE_LIMIT = 64;
const cache = new Map<string, string[]>();

export function markdownImageSources(markdown: string): string[] {
  if (!markdown.includes("![") && !/<img[\s>]/i.test(markdown)) return [];
  const cached = cache.get(markdown);
  if (cached) return cached;
  const sources = new Set<string>();
  const visit = (node: MarkdownNode) => {
    if (node.type === "image") sources.add(node.url);
    if ("children" in node) node.children.forEach(visit);
  };
  visit(parseMarkdownDocument(markdown));
  const result = [...sources];
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  cache.set(markdown, result);
  return result;
}
