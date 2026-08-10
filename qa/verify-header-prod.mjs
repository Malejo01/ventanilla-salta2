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
  await page.waitForTimeout(1200)

  const header = await page.evaluate(() => {
    const h = document.querySelector('header')
    const s = getComputedStyle(h)
    return { backgroundColor: s.backgroundColor, backdropFilter: s.backdropFilter, className: h.className }
  })
  console.log('PROD header computed style:', JSON.stringify(header))

  await page.evaluate(() => window.scrollTo(0, 600))
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(SHOT_DIR, 'FIX-header-scroll-600-PRODUCTION.png') })

  await page.evaluate(() => window.scrollTo(0, 1200))
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(SHOT_DIR, 'FIX-header-scroll-1200-PRODUCTION.png') })

  await browser.close()
}

run().catch((e) => { console.error(e); process.exit(1) })
