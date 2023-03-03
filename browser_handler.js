const puppeteer = require('puppeteer')
const events = require('events')
const fs = require('fs')


class browser_handler {
  constructor(isHeadless=true, viewport_width=800) {
    console.log('browser RESET')
    this.page = null
    this.browser = null
    this.isHeadless = isHeadless
    this.viewport_width = viewport_width
    this.screenshotLock = false
  }

  close() { this.browser.close() }

  init() {
    return new Promise((resolve, reject) => {
      try {
        (async () => {
          console.log('Launching browser')

          this.browser = await puppeteer.launch({
            headless: this.isHeadless,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
          })
          console.log('Launched')

          this.page = (await this.browser.pages())[0]
          this.page.setDefaultNavigationTimeout(0)

          this.browser.on("targetcreated", async (target) => {
            const page = await target.page()
            if (page == this.page) return
            if (page) {
              this.page = page
              console.log('Page updated to New')
            }
          })

          this.browser.on("targetdestroyed", async (target) => {
            let browserPages = await this.browser.pages()
            let targetPage = await target.page()
            if (browserPages.length == 0)
              this.page = await this.browser.newPage()
            if (this.page != browserPages[browserPages.length-1] &&
                browserPages[browserPages.length-1]) {
              this.page = browserPages[browserPages.length-1]
              console.log('Page updated to Last')
            }
          })

          console.log('Browser ready')
          resolve()
        })()
      } catch (error) { reject(error) }
    })
  }

  async getPage(url) {
    try {
      this.screenshotLock = true
      console.log('set Lock')
      await this.page.goto(url, {waitUntil: 'domcontentloaded'})
      console.log('page Loaded')
      let delay = ms => new Promise(resolve => setTimeout(resolve, ms))
    } catch (error) {
      if (error.message.includes('invalid URL'))
        console.error('invalid URL:', url)
      else
        console.error(error.message)
    } finally {
      console.log('open Lock')
      this.screenshotLock = false
    }
  }

  async getHtml() {
    let retries = 3
    while (retries) {
      try {
        return this.page.evaluate(() => document.querySelector('*').outerHTML)
      } catch (error) {
        if (!error.message.includes('Execution context was destroyed') &&
            !error.message.includes('Cannot read properties of null'))
          throw error
      }
      retries -= 1
    }
    return ''
  }
  
  resize(width, height) {
    [width, height] = [Math.round(width), Math.round(height)]
    let newWidth = this.viewport_width
    let newHeight = Math.round(this.viewport_width * height/width)
    console.log(`resize to ${newWidth}x${newHeight}`)
    this.page.setViewport({ width: newWidth, height: newHeight })
  }

  scroll(deltaX, deltaY) {
    this.page.mouse.wheel({deltaX: -deltaX, deltaY: -deltaY})
  }

  hover(x, y) {
    this.page.mouse.move(x, y)
  }

  pageBack() {
    this.page.goBack()
  }

  pageForward() {
    this.page.goForward()
  }

  async click(wsSender, posX, posY) {
    this.page.mouse.click(posX, posY)
  }

  async mousedown(wsSender, posX, posY) {
    this.page.mouse.down(posX, posY)
  }

  async mouseup(wsSender, posX, posY) {
    this.page.mouse.up(posX, posY)
  }

  async input(elemSel, keys) {
    for (let i = 0; i < keys.length; i++) {
      try {
        this.page.keyboard.press(keys[i])
      } catch(err) { }
    }
  }

  async getWindowRect() {
    let retries = 3
    while (retries) {
      try {
        var {width, height} = this.page.viewport()
        var [x, y] = await this.page.evaluate(() => [window.scrollX, window.scrollY])
        return { x, y, width, height }
      } catch (error) {
        if (!error.message.includes('Execution context was destroyed') &&
            !error.message.includes('Cannot read properties of null'))
          throw error
      }
      retries -= 1
    }
    return { x: null, y: null, width, height }
  }

  async getScreenshot(filepath='screenshot.jpg') {
    try {
      if (this.screenshotLock) return
      let {width, height} = this.page.viewport()
      process.stdout.write('SC In...\r')
      await this.page.evaluate(() => requestAnimationFrame(() => {}))
      let res = await this.page.screenshot({
        path: filepath,
        quality: 70,
        type: 'jpeg',
        encoding: 'binary',
        fullPage: false
      })
      process.stdout.write('SC Out   \r')
    } catch (error) {
      if (!error.message.includes('Not attached to an active page') &&
          !error.message.includes('Cannot take screenshot with 0 width'))
        throw error
      throw new Error('Unable to Take Screenshot, ' + error.message)
    }
  }

  async updateFrame(filepath='screenshot.jpg') {
    try {
      return await this.getScreenshot(filepath)
    } catch (error) {
      console.log('Error Screenshot:', error.message)
    }
  }

  async getLastPage() {
    let browserPages = await this.browser.pages()
    return browserPages[browserPages.length-1]
  }

  static normalizeUrl(url) {
    if (!(url.startsWith("http") || url.startsWith("www")))
      url = `www.${url}`
    if (!url.startsWith("http"))
      url = `https://${url}`
    return url
  }

  async getSelection(wsSender) {
    let retries = 3
    while (retries) {
      try {
        let selection = await this.page.evaluate(() =>
          window.getSelection().toString())
        wsSender.json({ wsPath: 'selection', selection })
        return
      } catch (error) {
        if (!error.message.includes('Execution context was destroyed') &&
            !error.message.includes('Cannot read properties of null'))
          throw error
      }
      retries -= 1
    }
    wsSender.json({ wsPath: 'selection', selection: '' })
  }
}


module.exports = { browser_handler }
