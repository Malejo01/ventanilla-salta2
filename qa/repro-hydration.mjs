// Repro focalizado: click en la primera card INMEDIATAMENTE al aparecer en el DOM,
// para ver si la hidratación de React llega a tiempo. 15 iteraciones, contexto nuevo cada vez.
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const BASE_URL = 'https://ventanilla-puce.vercel.app'
const SHOT_DIR = path.join(process.cwd(), 'qa-screenshots')
const N = 15

async function run() {
  const browser = await chromium.launch()
  const results = []

  for (let i = 0; i < N; i++) {
    const context = await browser.newContext()
    const page = await context.newPage()
    const reqLog = []
    page.on('request', (req) => {
      if (req.url().includes('/api/chat')) reqLog.push({ t: Date.now(), method: req.request?.() ?? req.method() })
    })

    const navStart = Date.now()
    let clickAt = null
    let outcome = 'unknown'
    let apiFired = false
    let ms_nav_to_domselector = null
    let ms_click_after_nav = null

    try {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.waitForSelector('#consulta', { timeout: 30000 })
      ms_nav_to_domselector = Date.now() - navStart

      // Click INMEDIATO sin esperar nada mas, como un usuario muy rapido.
      clickAt = Date.now()
      ms_click_after_nav = clickAt - navStart
      const card = page.getByRole('button', { name: 'Quiero abrir un foodtruck, ¿qué necesito?', exact: true })
      await card.click({ timeout: 5000 }).catch((e) => { outcome = 'click_error: ' + e.message })

      // Esperar hasta 8s a ver si aparece el indicador "pensando" o una burbuja de usuario.
      const seenLoading = await page.waitForFunction(
        () => document.body.innerText.includes('Tuki está pensando') || document.body.innerText.includes('Quiero abrir un foodtruck'),
        { timeout: 8000 },
      ).then(() => true).catch(() => false)

      apiFired = reqLog.length > 0

      if (seenLoading || apiFired) {
        outcome = 'ok_message_sent'
      } else if (outcome === 'unknown') {
        outcome = 'SILENT_FAILURE_no_message_sent'
        await page.screenshot({ path: path.join(SHOT_DIR, `repro-hydration-${i}-silentfail.png`), fullPage: true })
      }
    } catch (err) {
      outcome = 'exception: ' + String(err).slice(0, 200)
    } finally {
      await context.close()
    }

    results.push({ i, ms_nav_to_domselector, ms_click_after_nav, apiFired, outcome })
    console.log(`iter ${i}: domselector=${ms_nav_to_domselector}ms click@${ms_click_after_nav}ms apiFired=${apiFired} -> ${outcome}`)
  }

  await browser.close()
  fs.writeFileSync(path.join(process.cwd(), 'repro-hydration-report.json'), JSON.stringify(results, null, 2))
  const failures = results.filter((r) => r.outcome.includes('SILENT_FAILURE') || r.outcome.includes('exception') || r.outcome.includes('click_error'))
  console.log(`\nTotal: ${results.length}, fallas: ${failures.length}`)
}

run().catch((e) => { console.error(e); process.exit(1) })
