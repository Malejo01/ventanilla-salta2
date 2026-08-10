import { chromium } from '@playwright/test'
import path from 'node:path'

const BASE_URL = 'https://ventanilla-puce.vercel.app'
const SHOT_DIR = path.join(process.cwd(), 'qa-screenshots')

async function run() {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForSelector('#consulta', { timeout: 30000 })

  const card = page.getByRole('button', { name: 'Quiero abrir un foodtruck, ¿qué necesito?', exact: true })
  await card.click()
  await page.waitForFunction(() => !document.body.innerText.includes('Tuki está pensando'), { timeout: 45000 })
  await page.waitForTimeout(1500)

  // Screenshot SOLO del viewport (no fullPage) en distintas posiciones de scroll.
  await page.screenshot({ path: path.join(SHOT_DIR, 'verify-header-scroll-top.png') })

  await page.evaluate(() => window.scrollTo(0, 600))
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(SHOT_DIR, 'verify-header-scroll-600.png') })

  await page.evaluate(() => window.scrollTo(0, 1200))
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(SHOT_DIR, 'verify-header-scroll-1200.png') })

  await browser.close()
}

run().catch((e) => { console.error(e); process.exit(1) })
