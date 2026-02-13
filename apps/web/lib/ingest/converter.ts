import "pdf-parse/worker"
import type { MarkItDown } from "markitdown-ts"
import type { BookmarkType } from "./types"
import { EXTENSION_TYPE_MAP, URL_TYPE_PATTERNS } from "./types"

let markitdownInstance: MarkItDown | null = null
const PARAGRAPH_SPLIT_REGEX = /\n\n/
const BROWSER_ONLY_PATTERNS = [/^https?:\/\/mp\.weixin\.qq\.com\//]

async function getMarkItDown(): Promise<MarkItDown> {
  if (!markitdownInstance) {
    const { MarkItDown } = await import("markitdown-ts")
    markitdownInstance = new MarkItDown()
  }
  return markitdownInstance
}

async function convertUrlWithBrowser(url: string) {
  const { fetchWithBrowser } = await import("./browser")
  const html = await fetchWithBrowser(url)
  if (!html) {
    return null
  }
  return convertHtml(html, url)
}

export async function convertUrl(url: string) {
  // Sites that require browser rendering — skip markitdown entirely
  if (BROWSER_ONLY_PATTERNS.some((p) => p.test(url))) {
    return convertUrlWithBrowser(url)
  }

  const md = await getMarkItDown()

  try {
    const result = await md.convert(url)
    if (result?.markdown) {
      return { title: result.title, markdown: result.markdown }
    }
  } catch (error) {
    console.warn("[converter] markitdown failed, trying browser fallback:", error)
  }

  return convertUrlWithBrowser(url)
}

export async function convertBuffer(buffer: Buffer, fileExtension: string) {
  const md = await getMarkItDown()
  const result = await md.convertBuffer(buffer, { file_extension: fileExtension })
  if (!result) {
    return null
  }
  return { title: result.title, markdown: result.markdown }
}

export async function convertHtml(html: string, sourceUrl: string) {
  const md = await getMarkItDown()
  const response = new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  })
  const result = await md.convert(response, { url: sourceUrl })
  if (!result) {
    return null
  }
  return { title: result.title, markdown: result.markdown }
}

export function inferTypeFromExtension(ext: string): BookmarkType {
  return EXTENSION_TYPE_MAP[ext.toLowerCase()] ?? "other"
}

export function inferTypeFromUrl(url: string): BookmarkType {
  for (const { pattern, type } of URL_TYPE_PATTERNS) {
    if (pattern.test(url)) {
      return type
    }
  }
  return "link"
}

export function extractDescription(markdown: string): string {
  const text = markdown
    .replace(/^#+\s+.+$/gm, "")
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[([^\]]+)\]\(.*?\)/g, "$1")
    .replace(/[*_~`#>|-]/g, "")
    .trim()
  const firstParagraph = text.split(PARAGRAPH_SPLIT_REGEX)[0] ?? ""
  return firstParagraph.slice(0, 200).trim()
}
