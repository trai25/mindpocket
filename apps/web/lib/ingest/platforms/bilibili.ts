import type { ConvertResult } from "./index"

const BV_URL_REGEX = /\/video\/(BV[A-Za-z0-9]+)/
const BILIBILI_SUFFIX_REGEX = /_哔哩哔哩.*$/

function extractBvidFromUrl(url: string): string | null {
  const match = url.match(BV_URL_REGEX)
  return match ? match[1] : null
}

async function fetchTitle(bvid: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    })
    const json = await res.json()
    if (json?.data?.title) {
      return json.data.title.replace(BILIBILI_SUFFIX_REGEX, "").trim()
    }
  } catch (error) {
    console.error("[bilibili] Failed to fetch title from API:", error)
  }
  return null
}

export async function convertBilibili(url: string): Promise<ConvertResult | null> {
  const bvid = extractBvidFromUrl(url)
  if (!bvid) {
    return null
  }

  const title = await fetchTitle(bvid)
  const videoUrl = `https://www.bilibili.com/video/${bvid}`
  const iframeSrc = `//player.bilibili.com/player.html?isOutside=true&bvid=${bvid}`

  const markdown = [
    title ? `# ${title}` : "# B站视频",
    "",
    `**视频链接**：${videoUrl}`,
    "",
    `<iframe src="${iframeSrc}" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true"></iframe>`,
  ].join("\n")

  return { title, markdown }
}
