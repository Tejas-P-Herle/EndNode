import express from 'express'
import { browser_handler } from './browser_handler.js'
import { MongoClient } from 'mongodb'
import dotenv from 'dotenv'


dotenv.config()


const app = express()
const port = process.env.PORT || 5000
const isHeadless = process.env.HEADLESS !== 'false'
const uri = `mongodb+srv://admin:${process.env.password}@cluster0.fv1y59f.mongodb.net/?retryWrites=true&w=majority`


app.use(express.json());
app.use(express.urlencoded({ extended: true }));


let browser = null
let dbClient = null


app.get('/', async (req, res) => {
  await wakeUp()
  res.send('EndPoint Awake')
})


app.post('/scrape', async (req, res) => {
  if (!browser || !dbClient)
    await wakeUp()

  let { selectionRules, navigationRules } = req.body
  navigationRules.map(async pageRules => {
    let selectedRes = false
    for (let pageI in pageRules) {
      let pageRule = pageRules[pageI]
      selectedRes = await browser.pageNavigate(pageRule)
    }
    console.log('selectedRes', selectedRes)
    if (!selectedRes) {
      console.log('pageRules', pageRules)
      let pageRule = pageRules[0]
      let urlInfo = pageRule.path[0]
      let url = urlInfo[urlInfo.length - 1]
      let selParam = pageRule.resSel ? pageRule.resSel : url
      selParam = JSON.stringify(selParam)
      let pageSelRules = selectionRules[selParam]
      console.log('pageSelRules', pageSelRules)
      pageSelRules.map(async ([label, selRule]) => {
        // let [label, selRule] = selRule
        console.log('SelRule', label, selRule[1])
        let selText = await browser.getSelText(selRule[1], pageRule.resSel)
        console.log(`selText => ${label}: ${selText}`)
      })
    }
  })
  console.log('ip', selectionRules, navigationRules)
  res.send('DONE')
  // await browser.getPage(targetUrl)
  // let selections = []
  // if (!selectionRules || selectionRules.full) {
  //   selections = [await browser.getHtml()]
  // } else {
  //   selections = await browser.getSelections(selectionRules, navigationRules)
  // }
  // 
  // let collection = dbClient.db('ScraperData').collection(targetUrl)
  // let insertRes = await collection.insertMany(selections)
  // console.log(`Inserted ${insertRes.insertedCount} documents successfully`)
})


app.get('/sleep', async(req, res) => {
  await sleep()
  console.log('Going to Sleep')
  res.send('Going to sleep')
})


async function wakeUp () {
  let browserInitPromise = Promise.resolve(true)
  if (browser === null) {
    console.log('isHeadless', isHeadless)
    browser = new browser_handler(isHeadless)
    browserInitPromise = browser.init()
  } 
  
  let dbClientConnPromise = Promise.resolve(true)
  if (dbClient === null) {
    dbClient = new MongoClient(uri)
    dbClientConnPromise = dbClient.connect()
  }

  await dbClientConnPromise
  await browserInitPromise
}


async function sleep () {
  let browserClosePromise = browser.close()
  let dbClientClosePromise = dbClient.close()
  
  await browserClosePromise
  await dbClientClosePromise

  browser = dbClient = null
}


app.listen(port, () => {
  console.log(`Sever started at Port ${port}`)
})

