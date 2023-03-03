const express = require('express')
const { browser_handler } = require('./browser_handler')

const app = express()
const port = process.env.PORT || 5000

let browser = new browser_handler()

app.get('/', (req, res) => {
  res.send('Hello World 2')
})


app.get('/testBrowser', async (req, res) => {
  await browser.init()
  await browser.getPage('https://example.com')
  let html = await browser.getHtml()
  res.send(html)
  browser.close()
})


app.listen(port, () => {
  console.log(`Sever started at Port ${port}`)
})

