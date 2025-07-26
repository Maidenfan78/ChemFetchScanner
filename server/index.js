import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import puppeteer from 'puppeteer';
import { addExtra } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';
import FormData from 'form-data';
import { createClient } from '@supabase/supabase-js';
import { load } from 'cheerio';

dotenv.config();
const app = express();
const supabase = createClient(process.env.SB_URL, process.env.SB_SERVICE_KEY);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Puppeteer single-instance setup
const pptr = addExtra(puppeteer);
pptr.use(StealthPlugin());
let browserPromise;
async function getBrowser() {
  if (!browserPromise) {
    browserPromise = pptr.launch({
      headless: true,
      ignoreHTTPSErrors: true,
      args: ['--no-sandbox', '--ignore-certificate-errors'],
    });
  }
  return browserPromise;
}
async function closeBrowser() {
  if (browserPromise) {
    try { (await browserPromise).close(); } catch {};
    browserPromise = null;
  }
}
process.on('SIGINT', () => closeBrowser().finally(() => process.exit()));
process.on('SIGTERM', () => closeBrowser().finally(() => process.exit()));

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

app.use(express.json({ limit: '15mb' }));

// Bing search (headless + Cheerio fallback)
async function fetchBingLinksHeadless(barcode) {
  const term = `${barcode}`;
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-AU,en;q=0.9' });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)...');
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) req.abort();
    else req.continue();
  });
  await page.goto(`https://www.bing.com/search?q=${encodeURIComponent(term)}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('li.b_algo h2 a', { timeout: 10000 });
  const links = await page.$$eval('li.b_algo h2 a', els => els.map(a => a.href).slice(0, 5));
  await page.close();
  return links;
}
async function fetchBingLinksCheerio(barcode) {
  const term = `${barcode}`;
  const res = await axios.get(`https://www.bing.com/search?q=${encodeURIComponent(term)}`, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-AU' }
  });
  const $ = load(res.data);
  const urls = [];
  $('li.b_algo h2 a').each((_, el) => {
    const href = $(el).attr('href');
    if (href?.startsWith('http') && urls.length < 5) urls.push(href);
  });
  return urls;
}
async function fetchBingLinks(barcode) {
  let links = [];
  try { links = await fetchBingLinksHeadless(barcode); } catch {}
  if (!links.length) links = await fetchBingLinksCheerio(barcode);
  return links;
}

// Scrape product info + SDS links
async function scrapeProductInfo(url) {
  try {
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-AU', 'Referer': 'https://www.bing.com/' },
      timeout: 20000,
    });
    const $ = load(data);
    const name = $('h1').first().text().trim() || '';
    const sizeMatch = $('body').text().match(/(\d+(?:\.\d+)?\s?(?:ml|g|kg|oz|l))/i);
    const size = sizeMatch ? sizeMatch[0] : '';
    // Look for PDF links labeled SDS or MSDS
    const sdsLinks = $('a').map((_, a) => {
      const href = ($(a).attr('href') || '').trim();
      const text = ($(a).text() || '').toLowerCase();
      if (!/\.pdf$/i.test(href)) return null;
      if (!/(sds|msds|safety)/i.test(href + text)) return null;
      return href.startsWith('http') ? href : new URL(href, url).href;
    }).get();
    const sdsUrl = sdsLinks.length ? sdsLinks[0] : '';
    return { url, name, size, sdsUrl };
  } catch (e) {
    return null;
  }
}

// Fallback: direct SDS-PDF query
async function fetchSdsDirect(barcode) {
  const links = await fetchBingLinks(`${barcode} sds pdf`);
  for (const link of links) {
    if (link.endsWith('.pdf')) return link;
  }
  return '';
}

// --- /scan endpoint ---
app.post('/scan', async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Missing barcode' });
  // check existing
  const { data: existing } = await supabase.from('products').select('*').eq('barcode', code).maybeSingle();
  if (existing) {
    const scraped = [{ url: '', name: existing.product_name || '', size: existing.contents_size_weight || '', sdsUrl: existing.sds_url || '' }];
    return res.json({ code, product: existing, scraped });
  }
  // fresh scrape
  const urls = await fetchBingLinks(code);
  const scraped = (await Promise.all(urls.map(scrapeProductInfo))).filter(x => x);
  const top = scraped[0] || { name: '', size: '', sdsUrl: '' };
  if (!top.sdsUrl) top.sdsUrl = await fetchSdsDirect(code);
  const { error } = await supabase.from('products').insert([{
    barcode: code,
    product_name: top.name,
    contents_size_weight: top.size,
    sds_url: top.sdsUrl || null
  }]);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ code, scraped });
});

// --- /ocr endpoint ---
const CROP_PADDING_RATIO = 0.08;
app.post('/ocr', async (req, res) => {
  const { image, cropInfo } = req.body;
  if (!image) return res.status(400).json({ error: 'Missing image' });
  const buffer = Buffer.from(image, 'base64');
  const filename = `ocr_${Date.now()}.jpg`;
  fs.writeFileSync(filename, buffer);
  try {
    let processed = buffer;
    if (cropInfo?.width && cropInfo?.height && cropInfo?.photoWidth && cropInfo?.photoHeight) {
      const photoAR  = cropInfo.photoWidth  / cropInfo.photoHeight;
      const screenAR = cropInfo.screenWidth / cropInfo.screenHeight;
      let drawWidth, drawHeight, drawLeft, drawTop;
      if (photoAR > screenAR) {
        drawWidth  = cropInfo.screenWidth;
        drawHeight = drawWidth  / photoAR;
        drawLeft   = 0;
        drawTop    = (cropInfo.screenHeight - drawHeight)/2;
      } else {
        drawHeight = cropInfo.screenHeight;
        drawWidth  = drawHeight * photoAR;
        drawTop    = 0;
        drawLeft   = (cropInfo.screenWidth - drawWidth)/2;
      }
      const xRel  = (cropInfo.left - drawLeft)  / drawWidth;
      const yRel  = (cropInfo.top  - drawTop)   / drawHeight;
      const wRel  = cropInfo.width              / drawWidth;
      const hRel  = cropInfo.height             / drawHeight;
      let left    = Math.round(xRel * cropInfo.photoWidth);
      let top     = Math.round(yRel * cropInfo.photoHeight);
      let width   = Math.round(wRel * cropInfo.photoWidth);
      let height  = Math.round(hRel * cropInfo.photoHeight);
      const pad   = Math.round(height * CROP_PADDING_RATIO);
      left  = Math.max(left - pad, 0);
      top   = Math.max(top  - pad, 0);
      width = Math.min(width  + pad*2, cropInfo.photoWidth - left);
      height= Math.min(height + pad*2, cropInfo.photoHeight - top);
      processed = await sharp(buffer)
        .rotate()
        .extract({ left, top, width, height })
        .greyscale()
        .normalize()
        .median(1)
        .sharpen()
        .resize({ width:1200, withoutEnlargement:true })
        .toBuffer();
      fs.writeFileSync(`preprocessed_${Date.now()}.jpg`, processed);
    } else {
      processed = await sharp(buffer)
        .rotate()
        .greyscale()
        .normalize()
        .median(1)
        .sharpen()
        .resize({ width:1200, withoutEnlargement:true })
        .toBuffer();
      fs.writeFileSync(`preprocessed_${Date.now()}.jpg`, processed);
    }
    const form = new FormData();
    form.append('image', processed, { filename:'crop.jpg', contentType:'image/jpeg' });
    const ocrRes = await axios.post('http://localhost:5001/ocr', form, { headers: form.getHeaders(), timeout:60000 });
    console.log('Python OCR response:', ocrRes.data);
    res.json(ocrRes.data);
  } catch (e) {
    console.error('[OCR] Error during OCR:', e);
    res.status(500).json({ error: e.message });
  } finally {
    fs.unlink(filename, () => {});
  }
});

// --- /confirm endpoint ---
app.post('/confirm', async (req, res) => {
  const { code, name = '', size = '' } = req.body;
  if (!code) return res.status(400).json({ error: 'Missing code' });
  const updates = { product_name: name, contents_size_weight: size };
  const { data, error } = await supabase
    .from('products')
    .update(updates)
    .eq('barcode', code)
    .select()
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, product: data });
});

app.listen(3000, () => console.log('Listening on 3000'));
console.log('Supabase:', process.env.SB_URL, 'ServiceRole?', isServiceRole(process.env.SB_SERVICE_KEY));
