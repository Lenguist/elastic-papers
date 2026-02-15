/**
 * Extract full text from an arXiv paper.
 *
 * Strategy:
 * 1. Try arXiv HTML endpoint (available for most 2024+ papers) — fast, clean text
 * 2. Fall back to arXiv abstract if HTML unavailable
 */

/**
 * Extract full text from an arXiv paper using its HTML rendering.
 * Returns cleaned text ready for chunking and embedding.
 */
export type PaperExtraction = {
  text: string;
  githubLinks: string[];
};

export async function extractPaperText(arxivId: string): Promise<string> {
  const result = await extractPaperContent(arxivId);
  return result.text;
}

/**
 * Extract full text and GitHub links from an arXiv paper.
 */
export async function extractPaperContent(arxivId: string): Promise<PaperExtraction> {
  // Try HTML first (best quality, no binary parsing)
  const htmlResult = await tryArxivHtml(arxivId);
  if (htmlResult && htmlResult.text.length > 500) {
    return htmlResult;
  }

  // Fallback: just return empty — we'll rely on the abstract from ES
  console.warn(`  ⚠️ No HTML available for ${arxivId}, skipping full-text indexing`);
  return { text: "", githubLinks: [] };
}

/**
 * Fetch arXiv HTML version and extract clean text.
 * Available for most papers from 2024 onwards.
 */
async function tryArxivHtml(arxivId: string): Promise<PaperExtraction | null> {
  try {
    // Try with v1 suffix first, then without
    for (const suffix of ["v1", ""]) {
      const url = `https://arxiv.org/html/${arxivId}${suffix ? suffix : ""}`;
      const res = await fetch(url, {
        headers: { "User-Agent": "ResearchAtelier/1.0 (academic paper tool)" },
        redirect: "follow",
      });
      if (res.ok) {
        const html = await res.text();
        const text = extractTextFromHtml(html);
        const githubLinks = extractGithubLinks(html);
        return { text, githubLinks };
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Extract GitHub repository links from HTML content.
 */
function extractGithubLinks(html: string): string[] {
  const ghRegex = /https?:\/\/github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+/g;
  const matches = html.match(ghRegex) || [];
  const unique = new Set<string>();
  for (const m of matches) {
    // Clean trailing HTML artifacts and punctuation
    const clean = m.replace(/[.,;)}\]"'<>]+$/, "");
    // Skip github.com/github/ and other non-repo links
    if (clean.split("/").filter(Boolean).length >= 4) {
      unique.add(clean);
    }
  }
  return [...unique];
}

/**
 * Extract clean text from arXiv HTML page.
 * Strips tags, scripts, styles, navigation, and cleans up whitespace.
 */
function extractTextFromHtml(html: string): string {
  // Remove script, style, nav, header, footer tags and their contents
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "");

  // Convert some tags to newlines for structure
  text = text
    .replace(/<\/?(h[1-6]|p|div|section|article|blockquote|li|tr|br)\b[^>]*>/gi, "\n")
    .replace(/<\/?(ul|ol|table|thead|tbody)\b[^>]*>/gi, "\n\n");

  // Strip all remaining HTML tags
  text = text.replace(/<[^>]+>/g, " ");

  // Decode HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)));

  // Clean whitespace
  text = text
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text;
}

export type TextChunk = {
  text: string;
  index: number;
};

/**
 * Split text into overlapping chunks suitable for embedding.
 * Target ~500 tokens per chunk (~2000 chars) with 200-char overlap.
 */
export function chunkText(
  text: string,
  maxChars: number = 2000,
  overlap: number = 200
): TextChunk[] {
  if (!text || text.length === 0) return [];

  // If text is short enough, return as single chunk
  if (text.length <= maxChars) {
    return [{ text, index: 0 }];
  }

  const chunks: TextChunk[] = [];
  let start = 0;
  let idx = 0;

  while (start < text.length) {
    let end = start + maxChars;

    // Try to break at a paragraph boundary
    if (end < text.length) {
      const paraBreak = text.lastIndexOf("\n\n", end);
      if (paraBreak > start + maxChars * 0.5) {
        end = paraBreak;
      } else {
        // Fall back to sentence boundary
        const sentenceBreak = text.lastIndexOf(". ", end);
        if (sentenceBreak > start + maxChars * 0.5) {
          end = sentenceBreak + 1;
        }
      }
    } else {
      end = text.length;
    }

    const chunkText = text.slice(start, end).trim();
    if (chunkText.length > 0) {
      chunks.push({ text: chunkText, index: idx++ });
    }

    // If we've reached the end of the text, stop
    if (end >= text.length) break;

    // Move start forward with overlap
    start = end - overlap;
  }

  return chunks;
}
