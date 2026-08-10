import { chromium } from '@playwright/test'
import path from 'node:path'

const SHOT_DIR = path.join(process.cwd(), 'qa-screenshots')

async function run() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForSelector('#consulta', { timeout: 15000 })

  const card = page.getByRole('button', { name: 'Quiero abrir un foodtruck, ¿qué necesito?', exact: true })
  await card.click()
  await page.waitForFunction(() => !document.body.innerText.includes('Tuki está pensando'), { timeout: 45000 })
  await page.waitForTimeout(1000)

  await page.evaluate(() => window.scrollTo(0, 600))
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(SHOT_DIR, 'FIX-header-scroll-600-local.png') })

  await browser.close()
}

run().catch((e) => { console.error(e); process.exit(1) })
