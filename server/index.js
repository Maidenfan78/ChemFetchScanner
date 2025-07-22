import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';
import { load } from 'cheerio';

dotenv.config();
const app = express();
const supabase = createClient(process.env.SB_URL, process.env.SB_SERVICE_KEY);

// Check for service_role key
function isServiceRole(key) {
  if (!key) return false;
  const parts = key.split('.');
  if (parts.length < 2) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
    return payload.role === 'service_role';
  } catch {
    return false;
  }
}

app.use(express.json());

// HEADLESS BROWSER SEARCH
async function fetchGoogleLinksHeadless(barcode) {
  const term = `Item ${barcode}`;
  console.log(`Headless searching for: ${term}`);

  const browser = await puppeteer.launch({
    headless: true,
    ignoreHTTPSErrors: true,
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-AU,en;q=0.9' });
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
  );
  // Set consent cookie to avoid interstitial
  await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded' });
  await page.setCookie({ name: 'CONSENT', value: 'YES+US.au', domain: '.google.com' });

  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(term)}&hl=en-AU&gl=AU&safe=off&num=10`;
  console.log(`Navigating to: ${searchUrl}`);
  await page.goto(searchUrl, { waitUntil: 'networkidle2' });
  await page.waitForSelector('a', { timeout: 5000 }).catch(() => {});

  // 1. div.yuRUbf links
  let links = await page.$$eval('div.yuRUbf > a', els => els.map(a => a.href).slice(0, 5));
  console.log('Links (div.yuRUbf):', links);

  // 2. /url?q= anchors
  if (!links.length) {
    links = await page.$$eval('a[href^="/url?q="]', els =>
      els.map(a => {
        const m = a.href.match(/\/url\?q=([^&]+)/);
        return m ? decodeURIComponent(m[1]) : null;
      }).filter(u => !!u).slice(0, 5)
    );
    console.log('Links (/url?q=):', links);
  }

  // 3. a > h3 (result titles)
  if (!links.length) {
    links = await page.$$eval('a > h3', els =>
      els.map(h3 => h3.parentElement.href).slice(0, 5)
    );
    console.log('Links (h3 parent):', links);
  }

  // 4. generic div.g anchors
  if (!links.length) {
    links = await page.$$eval('div.g a', els =>
      els.map(a => a.href).filter(u => u.startsWith('http') && !u.includes('google.com')).slice(0, 5)
    );
    console.log('Links (div.g):', links);
  }

  await browser.close();
  return links;
}

// CHEERIO FALLBACK
async function fetchGoogleLinksCheerio(barcode) {
  const term = `Item ${barcode}`;
  console.log(`Cheerio fallback for: ${term}`);

  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(term)}&hl=en-AU&gl=AU&safe=off&num=10`;
  console.log(`Fetching: ${searchUrl}`);
  const res = await axios.get(searchUrl, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-AU' } });
  const $ = load(res.data);
  let urls = [];

  // 1. div.yuRUbf links
  $('div.yuRUbf > a').each((i, el) => {
    const link = $(el).attr('href');
    if (link && link.startsWith('http') && !urls.includes(link)) urls.push(link);
    if (urls.length >= 5) return false;
  });
  console.log('Cheerio primary URLs:', urls);

  // 2. /url?q=
  if (!urls.length) {
    $('a[href^="/url?q="]').each((i, el) => {
      const href = $(el).attr('href') || '';
      const m = href.match(/^\/url\?q=([^&]+)/);
      if (m) {
        const link = decodeURIComponent(m[1]);
        if (link.startsWith('http') && !urls.includes(link)) urls.push(link);
      }
      if (urls.length >= 5) return false;
    });
    console.log('Cheerio fallback URLs:', urls);
  }

  // 3. h3 parent anchors
  if (!urls.length) {
    $('a > h3').each((i, el) => {
      const link = $(el).parent().attr('href');
      if (link && link.startsWith('http') && !urls.includes(link)) urls.push(link);
      if (urls.length >= 5) return false;
    });
    console.log('Cheerio h3 URLs:', urls);
  }

  // 4. div.g anchors
  if (!urls.length) {
    $('div.g a').each((i, el) => {
      const link = $(el).attr('href');
      if (link && link.startsWith('http') && !link.includes('google.com') && !urls.includes(link)) urls.push(link);
      if (urls.length >= 5) return false;
    });
    console.log('Cheerio div.g URLs:', urls);
  }

  return urls;
}

// MAIN SEARCH
async function fetchGoogleLinks(barcode) {
  let links = [];
  try { links = await fetchGoogleLinksHeadless(barcode); } catch (e) { console.error('Headless error:', e.message); }
  if (!links.length) {
    console.log('Falling back to Cheerio');
    links = await fetchGoogleLinksCheerio(barcode);
  }
  console.log('Final search URLs:', links);
  return links;
}

// SCRAPER
async function scrapeProductInfo(url) {
  try {
    const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-AU', 'Referer': 'https://www.google.com/' } });
    const $ = load(data);
    const name = $('h1').first().text().trim() || '';
    let manufacturer = $('[itemprop="manufacturer"], .brand').first().text().trim() || new URL(url).hostname;
    const txt = $('body').text() || '';
    const sizeMatch = txt.match(/(\d+(\.\d+)?\s?(ml|g|kg|oz|l))/i);
    const size = sizeMatch ? sizeMatch[0] : '';
    const sdsLinks = $('a').map((i, a) => { const $a = $(a); const href = $a.attr('href')||''; const text = $a.text()||''; if (/\.pdf$/i.test(href)&&/sds|msds|safety/i.test(href+text)) return href.startsWith('http')?href:new URL(href,url).href; }).get();
    const sdsUrl = sdsLinks[0]||'';
    return { url, name, manufacturer, size, sdsUrl };
  } catch (e) { console.warn(`Scrape error ${url}:`, e.message); return null; }
}

app.post('/scan', async (req, res) => {
  const { code } = req.body;
  const urls = await fetchGoogleLinks(code);
  const scraped = (await Promise.all(urls.map(scrapeProductInfo))).filter(x=>x);
  console.log('Scraped:', scraped);
  const top = scraped[0] || {};
  const { name='', manufacturer='', size='', sdsUrl='' } = top;
  const { error } = await supabase.from('products').insert([{ barcode: code, product_name: name, manufacturer, size, weight: size, sds_url: sdsUrl }]);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ code, scraped });
});

app.listen(3000,()=>console.log('Listening on 3000'));
console.log('Supabase:', process.env.SB_URL, 'ServiceRole?', isServiceRole(process.env.SB_SERVICE_KEY));
