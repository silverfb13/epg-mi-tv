const { chromium } = require('@playwright/test')
const fs = require('fs')
const dayjs = require('dayjs')
const { parseStringPromise } = require('xml2js')

async function scrapeEPG() {
  const canaisXML = fs.readFileSync('canais.xml', 'utf-8')
  const canais = await parseStringPromise(canaisXML)

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<tv generator-info-name="MeuEPG">\n`

  for (const canal of canais.channels.channel) {
    const nomeCanal = canal._.trim()
    const siteId = canal.$.site_id
    const url = `https://mi.tv/br/canais/${siteId.split('#')[1]}`

    console.log(`Capturando: ${nomeCanal}`)

    try {
      await page.goto(url, { waitUntil: 'networkidle' })
      await page.waitForSelector('#listings > ul > li', { timeout: 15000 })

      const programs = await page.$$eval('#listings > ul > li', items => {
        return items.map(item => {
          const time = item.querySelector('a > div.content > span.time')?.innerText.trim()
          const title = item.querySelector('a > div.content > h2')?.innerText.trim()
          const desc = item.querySelector('a > div.content > p.synopsis')?.innerText.trim()
          return { time, title, desc }
        })
      })

      xml += `  <channel id="${siteId}">\n    <display-name>${nomeCanal}</display-name>\n    <url>${url}</url>\n  </channel>\n`

      const now = dayjs()

      programs.forEach(program => {
        if (!program.time || !program.title) return

        const [hour, minute] = program.time.split(':').map(x => parseInt(x))
        const startTime = now.hour(hour).minute(minute).second(0)
        const stopTime = startTime.add(1, 'hour')

        const start = startTime.format('YYYYMMDDHHmmss') + ' +0000'
        const stop = stopTime.format('YYYYMMDDHHmmss') + ' +0000'

        xml += `  <programme start="${start}" stop="${stop}" channel="${siteId}">\n`
        xml += `    <title>${program.title}</title>\n`
        xml += `    <desc>${program.desc || ''}</desc>\n`
        xml += `  </programme>\n`
      })

    } catch (err) {
      console.log(`Erro ao capturar ${nomeCanal}:`, err.message)
      continue
    }
  }

  xml += `</tv>`

  fs.writeFileSync('epg.xml', xml)
  await browser.close()
}

scrapeEPG()
