import * as cheerio from 'cheerio'
import axios from 'axios'
import { exit } from 'process'
import { Config, JsonDB } from 'node-json-db'
import * as _ from 'lodash'

interface Category {
    name: string
    url: string
}

interface ScriptProduct {
    '@context': string
    '@type': string
    name: string
    image: string[]
    description: string
    brand: {
        '@type': string
        name: string
    }
    sku: string
    gtin: string
    offers: {
        '@type': string
        url: string
        priceCurrency: string
        price: string
        availability: string
    }
}

const db = new JsonDB(new Config('db', true, true, '/'))

const main = async () => {
    const categories = await getCategories()
    for (const category of categories){
        console.log("Category: ", category.name)
        try{
            await perPage(category);
        } catch (e) {
            console.error(e)
        }
    }
}

main()
    .then(() => {
        exit(0)
    })
    .catch((err) => {
        console.error(err)
        exit(1)
    })

async function perPage(category: Category) {
    let productsPage;
    try{
        productsPage = await axios.get(category.url, { timeout: 500000 })
    } catch (e) {
        console.error(e)
        return
    }
    const $productsPage = cheerio.load(productsPage.data)
    const $products = $productsPage('a.product-item-link')
    $products.each((index, element) => {
        const $element = $productsPage(element)
        const productUrl = $element.attr('href')!
        try{
            perProduct(productUrl)
        } catch (e) {
            console.error(e)
        }
    })
    const $nextPage = $productsPage('a.action.next')
    if ($nextPage.length === 0) {
        console.log('No next page')
    } else {
        console.log("Nex page: ", $nextPage.attr('href')!)
        await perPage({ name: category.name, url: $nextPage.attr('href')! })
    }
}

async function perProduct(productUrl: string) {
    let productPage;
    try{
        productPage = await axios.get(productUrl , { timeout: 500000 })
    } catch (e) {
        console.error(e)
        return
    }
    const $productPage = cheerio.load(productPage.data)
    //@ts-ignore
    const script = $productPage('script[type="application/ld+json"]').get()[1]?.children[0]?.data

    if (!script) return
    const productJson = JSON.parse(script)
    console.log(productJson.name)
    await db.push('/products[]', productJson, true);
}

async function getCategories(): Promise<Category[]> {
    const categories: Category[] = []
    const landingPge = await axios.get('https://www.carrefour.tn/default/' , { timeout: 500000 })
    const $landingPage = cheerio.load(landingPge.data)
    const $nav = await $landingPage('ul.nav').has('li > a')
    const $categories = $nav.find('li').has('a[href]')
    $categories.each((index, element) => {
        const $element = $landingPage(element)
        const name = $element.text().trim().replace(/\s+/g, ' ')
        const url = $element.find('a').attr('href')!
        categories.push({ name, url })
    })
    return categories
}
