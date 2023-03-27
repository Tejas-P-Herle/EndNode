import puppeteer from 'puppeteer'
import events from 'events'
import fs from 'fs'
import url from 'url'
import util from 'util'


export class browser_handler {
  constructor(isHeadless, viewport_width) {
    console.log('browser RESET')
    this.page = null
    this.browser = null
    this.isHeadless = isHeadless
    this.viewport_width = viewport_width
    this.screenshotLock = false
    this.scrollExec = false
    this.wsSender = null
    this.pageViewport = null
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

					await this.browser.newPage()
          let pages = await this.browser.pages()
          this.page = pages[1]
          this.page.setDefaultNavigationTimeout(0)

          this.page.on('framenavigated', () => this.pageUrlListener(this))

          this.browser.on("targetcreated", async (target) => {
            const page = await target.page()
            if (page && page != this.page) {
              this.getPage(await page.url(), false, false)
              page.close()
            }
          })

          console.log('Browser ready')
          resolve()
        })()
      } catch (error) { reject(error) }
    })
  }

  async pageUrlListener(browser) {
    let pageUrl = await browser.page.url()
  }

  async getPage(pageUrl) {
    try {

      let page = this.page
      this.screenshotLock = true
      console.log('set Lock')
      await page.goto(pageUrl, {waitUntil: 'domcontentloaded'})
      console.log('page Loaded')
      let delay = ms => new Promise(resolve => setTimeout(resolve, ms))
    } catch (error) {
      if (error.message.includes('invalid URL'))
        console.error('invalid URL:', pageUrl)
    } finally {
      console.log('open Lock')
      this.screenshotLock = false
    }
  }

  resize(width, height) {
    [width, height] = [Math.round(width), Math.round(height)]
    let newWidth = this.viewport_width
    let newHeight = Math.round(this.viewport_width * height/width)
    console.log(`resize to ${newWidth}x${newHeight}`)
    if (!Number.isInteger(newWidth) || !Number.isInteger(newHeight))
      return
    this.pageViewport = [width, height]
    this.page.setViewport({ width: newWidth, height: newHeight })
  }

  async scroll(deltaX, deltaY) {
    await this.page.mouse.wheel({deltaX: -deltaX, deltaY: -deltaY})
    this.scrollExec = true
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

  async safeEvaluate(evalFunc, evalArgs=[], retries=3) {

    let page = this.page
    while (retries) {
      try {
        return await page.evaluate(evalFunc, ...evalArgs)
      } catch (error) {
        if (!error.message.includes('Execution context was destroyed') &&
            !error.message.includes('Cannot read properties of null'))
          throw error
      }
      retries -= 1
    }
  }

  async click(posX, posY) {
    this.page.mouse.click(posX, posY)
  }

  async mousedown(posX, posY) {
    this.page.mouse.down(posX, posY)
  }

  async mouseup(posX, posY) {
    this.page.mouse.up(posX, posY)
  }

  async input(elemSel, keys) {
    this.page.focus(elemSel)
    for (let i = 0; i < keys.length; i++) {
      try {
        this.page.keyboard.press(keys[i])
      } catch(err) { }
    }
  }

  async getWindowRect() {
    var {width, height} = this.page.viewport()
    var [x, y] = await this.safeEvaluate(() => [window.scrollX, window.scrollY])
    return { x, y, width, height }
  }

  async getScreenshot(filepath='screenshot.jpg') {
    try {
      if (this.screenshotLock) return
      let {width, height} = this.page.viewport()
      process.stdout.write('SC In...\r')
      // await this.page.evaluate(() => requestAnimationFrame(() => {}))
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

  static normalizeUrl(pageUrl) {
    if (!(pageUrl.startsWith("http") || pageUrl.startsWith("www")))
      pageUrl = `www.${pageUrl}`
    if (!pageUrl.startsWith("http"))
      pageUrl = `https://${pageUrl}`
    return pageUrl
  }

  async pageNavigate(pageRules) {
    for (let pageRuleI in pageRules.path) {
      let pageRule = pageRules.path[pageRuleI]
      console.log('pageRule', pageRule)
      if (pageRule[0] == 'get') {
        console.log('getPage', pageRule[1])
        await this.getPage(pageRule[1])
      } else if (pageRule[0] == 'click') {
        if (pageRule[1] != pageRules.resSel) {
          await this.safeEvaluate((elSel) => {
            try {
              let el = document.querySelector(elSel)
              el.click()
            } catch (err) {}
          }, pageRule[1])
        } else {
          throw new Error('Implement ResSel selection')
          return true
        }
      } else if (pageRule[0] == 'input') {
        this.input(pageRule[1], pageRule[2])
      }
    }
    return false
  }

  async getSelText(sel, resSel) {
    console.log('sel', sel, resSel)
    return await this.safeEvaluate((sel, resSel) => {
      function applySel(sel, base=null) {
        if (!sel?.map) return []
        base = base === null ? document.querySelector('html') : base
        sel.map(seg => {
          if (typeof(seg) == 'number') {
            if (base[0]?.length)
              base = [...base].map(el => el[seg])
            else
              base = base[seg]
          } else if (typeof(seg) == 'string') {
              // console.log('base', base, NodeList.prototype.isPrototypeOf(base))
              if (NodeList.prototype.isPrototypeOf(base) || Array.isArray(base))
                  base = [...base].map(el => el[seg])
              else
                  base = base.getAttribute(seg)
          } else {
            let selStr = ''
            let selType = 'querySel'
            seg.map(part => {
              if (typeof(part) == 'string')
                selStr += part
              else if (Array.isArray(part)) {
                if (part[0] == 'contains') {
                  
                  let textLower = (`translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',`
                    +`'abcdefghijklmnopqrstuvwxyz')`)
                  selStr += `[contains(${textLower}, '${part[1]}')]`;
                  selType = 'xpath';
                } else if (part[0] == 'textEq') {
                  selStr += `[text() = '${part[1]}']`
                  selType = 'xpath';
                }
              } else
                selStr += Object.entries(part).map(
                  attr => `[${attr[0]}='${attr[1]}']`)
            })
            // console.log('selStr', selStr)
            if (selType == 'querySel')
              try {
                base = base.querySelectorAll(selStr)
              } catch (error) {
                console.log('error selecting', sel)
                return []
              }
            else {
              xpathIter = document.evaluate('.//' + selStr, base, null,
                XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
              base = []
              let node = xpathIter.iterateNext();
              while (node) {
                base.push(node);
                node = xpathIter.iterateNext();
              }
            }
          }
        })
        return base
      }
      let elem = applySel(sel)
      let results;
      if (typeof(resSel) == 'string')
        results = document.querySelector(resSel)
      else
        results = applySel(resSel)

      if (results.some && results.some(res => res.contains(elem)))
        elem = results.map(res => {
          return applySel(sel, res)
        })
      if (elem?.textContent)
        return elem.textContent
      else if (elem[0]?.textContent)
        return [...elem].map(el => el.textContent)
      return ''
    }, [sel, resSel])
  }

  async getSelection() {
    let selection = await this.safeEvaluate(() => window.getSelection().toString())
    this.wsSender.json({ wsPath: 'selection', selection })
  }
}


