const CHROMIUM_PACK_URL =
  "https://github.com/Sparticuz/chromium/releases/download/v143.0.0/chromium-v143.0.0-pack.x64.tar"

async function getBrowser() {
  const puppeteer = await import("puppeteer-core").then((mod) => mod.default)

  if (process.env.VERCEL_ENV === "production") {
    const chromium = await import("@sparticuz/chromium-min").then((mod) => mod.default)
    const executablePath = await chromium.executablePath(CHROMIUM_PACK_URL)
    return puppeteer.launch({
      args: chromium.args,
      executablePath,
      headless: true,
    })
  }

  return puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  })
}

export async function fetchWithBrowser(url: string): Promise<string | null> {
  let browser: import("puppeteer-core").Browser | null = null

  try {
    browser = await getBrowser()
    const page = await browser.newPage()

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    )
    await page.setExtraHTTPHeaders({
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    })

    await page.goto(url, { waitUntil: "networkidle0", timeout: 30_000 })

    const html = await page.content()
    return html || null
  } catch (error) {
    console.error("[browser] Failed to fetch with browser:", error)
    return null
  } finally {
    await browser?.close()
  }
}
