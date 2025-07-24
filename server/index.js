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

const pptr = addExtra(puppeteer);
pptr.use(StealthPlugin());
import { createClient } from '@supabase/supabase-js';
import { load } from 'cheerio';

dotenv.config();
const app = express();
const supabase = createClient(process.env.SB_URL, process.env.SB_SERVICE_KEY);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let browserPromise;
async function getBrowser() {
  if (!browserPromise) {
    browserPromise = pptr.launch({
      headless: true,
      ignoreHTTPSErrors: true,
      args: ['--no-sandbox', '--ignore-certificate-errors']
    });
  }
  return browserPromise;
}

async function closeBrowser() {
  if (browserPromise) {
    try {
      const browser = await browserPromise;
      await browser.close();
    } catch {}
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

// HEADLESS BROWSER SEARCH (Bing)
async function fetchBingLinksHeadless(barcode) {
  const term = `${barcode}`;
  console.log(`Headless searching Bing for: ${term}`);

  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-AU,en;q=0.9' });
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
  );
  await page.setRequestInterception(true);
  page.on('request', req => {
    const type = req.resourceType();
    if (['image', 'stylesheet', 'font', 'media'].includes(type)) req.abort();
    else req.continue();
  });

  const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(term)}`;
  console.log(`Navigating to: ${searchUrl}`);
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('li.b_algo h2 a', { timeout: 10000 });

  const links = await page.$$eval('li.b_algo h2 a', els =>
    els.map(a => a.href).slice(0, 5)
  );
  console.log('Bing links:', links);

  await page.close();
  return links;
}

// CHEERIO FALLBACK (Bing)
async function fetchBingLinksCheerio(barcode) {
  const term = `Item ${barcode}`;
  console.log(`Cheerio fallback for Bing: ${term}`);

  const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(term)}`;
  console.log(`Fetching: ${searchUrl}`);
  const res = await axios.get(searchUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept-Language': 'en-AU'
    }
  });
  const $ = load(res.data);
  let urls = [];

  $('li.b_algo h2 a').each((i, el) => {
    const link = $(el).attr('href');
    if (link && link.startsWith('http') && !urls.includes(link)) urls.push(link);
    if (urls.length >= 5) return false;
  });
  console.log('Cheerio Bing URLs:', urls);

  return urls;
}

// MAIN SEARCH (Bing)
async function fetchBingLinks(barcode) {
  let links = [];
  try { links = await fetchBingLinksHeadless(barcode); } catch (e) { console.error('Headless error:', e.message); }
  if (!links.length) {
    console.log('Falling back to Cheerio');
    links = await fetchBingLinksCheerio(barcode);
  }
  console.log('Final search URLs:', links);
  return links;
}

// SCRAPER
async function scrapeProductInfo(url) {
  try {
    const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-AU', 'Referer': 'https://www.bing.com/' } });
    const $ = load(data);
    const name = $('h1').first().text().trim() || '';
    let manufacturer = $('[itemprop="manufacturer"], .brand').first().text().trim() || new URL(url).hostname;
    const txt = $('body').text() || '';
    const sizeMatch = txt.match(/(\d+(\.\d+)?\s?(ml|g|kg|oz|l))/i);
    const size = sizeMatch ? sizeMatch[0] : '';
    const sdsLinks = $('a').map((i, a) => { const $a = $(a); const href = $a.attr('href') || ''; const text = $a.text() || ''; if (/\.pdf$/i.test(href) && /sds|msds|safety/i.test(href + text)) return href.startsWith('http') ? href : new URL(href, url).href; }).get();
    const sdsUrl = sdsLinks[0] || '';
    return { url, name, manufacturer, size, sdsUrl };
  } catch (e) { console.warn(`Scrape error ${url}:`, e.message); return null; }
}

// --- SCAN ENDPOINT ---
app.post('/scan', async (req, res) => {
  const { code } = req.body;

  // Check if this barcode already exists to avoid duplicates
  const { data: existing, error: selectError } = await supabase
    .from('products')
    .select('*')
    .eq('barcode', code)
    .maybeSingle();

  if (selectError) {
    return res.status(500).json({ error: selectError.message });
  }

  if (existing) {
    // Return stored name for consistency with front end
    const { product_name: name = '' } = existing;
    const scraped = [{ url: '', name, manufacturer: '', size: '', sdsUrl: '' }];
    return res.json({ code, product: existing, scraped });
  }

  const urls = await fetchBingLinks(code);
  const scraped = (await Promise.all(urls.map(scrapeProductInfo))).filter(x => x);
  console.log('Scraped:', scraped);
  const top = scraped[0] || {};
  const { name = '' } = top;
  const { error } = await supabase
    .from('products')
    .insert([{ barcode: code, product_name: name }]);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ code, scraped });
});

// --- OCR ENDPOINT --- (calls Python microservice)
const CROP_PADDING_RATIO = 0.08; // 8% padding

app.post('/ocr', async (req, res) => {
  const { image, cropInfo } = req.body;
  if (!image) return res.status(400).json({ error: 'Missing image' });

  const buffer = Buffer.from(image, 'base64');
  const filename = `ocr_${Date.now()}.jpg`;
  fs.writeFileSync(filename, buffer);

  try {

    let processed = buffer;
    if (cropInfo && cropInfo.width && cropInfo.height && cropInfo.photoWidth && cropInfo.photoHeight) {
      const photoAR = cropInfo.photoWidth / cropInfo.photoHeight;
      const screenAR = cropInfo.screenWidth / cropInfo.screenHeight;

      let drawWidth, drawHeight, drawLeft, drawTop;

      if (photoAR > screenAR) {
        drawWidth = cropInfo.screenWidth;
        drawHeight = drawWidth / photoAR;
        drawLeft = 0;
        drawTop = (cropInfo.screenHeight - drawHeight) / 2;
      } else {
        drawHeight = cropInfo.screenHeight;
        drawWidth = drawHeight * photoAR;
        drawTop = 0;
        drawLeft = (cropInfo.screenWidth - drawWidth) / 2;
      }

      const xRel = (cropInfo.left - drawLeft) / drawWidth;
      const yRel = (cropInfo.top - drawTop) / drawHeight;
      const wRel = cropInfo.width / drawWidth;
      const hRel = cropInfo.height / drawHeight;

      let left = Math.round(xRel * cropInfo.photoWidth);
      let top = Math.round(yRel * cropInfo.photoHeight);
      let width = Math.round(wRel * cropInfo.photoWidth);
      let height = Math.round(hRel * cropInfo.photoHeight);

      const pad = Math.round(height * CROP_PADDING_RATIO);
      left = Math.max(left - pad, 0);
      top = Math.max(top - pad, 0);
      width = Math.min(width + pad * 2, cropInfo.photoWidth - left);
      height = Math.min(height + pad * 2, cropInfo.photoHeight - top);

      const extract = { left, top, width, height };
      console.log('Crop extract:', extract);


      processed = await sharp(buffer)
        .rotate()
        .extract(extract)
        .greyscale()
        .normalize()
        .median(1)
        .sharpen()
        .resize({ width: 1200, withoutEnlargement: true })
        .toBuffer();

      fs.writeFileSync(`preprocessed_${Date.now()}.jpg`, processed);
    } else {
      processed = await sharp(buffer)
        .rotate()
        .greyscale()
        .normalize()
        .median(1)
        .sharpen()
        .resize({ width: 1200, withoutEnlargement: true })
        .toBuffer();
      fs.writeFileSync(`preprocessed_${Date.now()}.jpg`, processed);
    }

    // ---- Send processed image to Python microservice! ----
    const form = new FormData();
    form.append('image', processed, {
      filename: 'crop.jpg',
      contentType: 'image/jpeg'
    });

    const ocrRes = await axios.post(
      'http://localhost:5001/ocr',
      form,
      { headers: form.getHeaders(), timeout: 60000 }
    );
    console.log('Python OCR response:', ocrRes.data);

    res.json(ocrRes.data);

  } catch (e) {
    console.log('[OCR] Error during OCR:', e);
    res.status(500).json({ error: e.message });
  } finally {
    fs.unlink(filename, () => {});
  }
});

// --- CONFIRM ENDPOINT ---
app.post('/confirm', async (req, res) => {
  const { code, name = '', size = '' } = req.body || {};
  if (!code) return res.status(400).json({ error: 'Missing code' });
  const updates = { product_name: name, size };
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
