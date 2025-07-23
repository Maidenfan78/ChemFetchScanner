import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import puppeteer from 'puppeteer';
import { addExtra } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import Tesseract from 'tesseract.js';
import fs from 'fs';
import sharp from 'sharp';

const pptr = addExtra(puppeteer);
pptr.use(StealthPlugin());
import { createClient } from '@supabase/supabase-js';
import { load } from 'cheerio';

dotenv.config();
const app = express();
const supabase = createClient(process.env.SB_URL, process.env.SB_SERVICE_KEY);

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

  const browser = await pptr.launch({
    headless: true,
    ignoreHTTPSErrors: true,
    args: ['--no-sandbox', '--ignore-certificate-errors']
  });
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-AU,en;q=0.9' });
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
  );

  const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(term)}`;
  console.log(`Navigating to: ${searchUrl}`);
  await page.goto(searchUrl, { waitUntil: 'networkidle2' });
  await page.waitForSelector('li.b_algo h2 a', { timeout: 15000 });

  const links = await page.$$eval('li.b_algo h2 a', els =>
    els.map(a => a.href).slice(0, 5)
  );
  console.log('Bing links:', links);

  await browser.close();
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

// --- OCR ENDPOINT ---
// Now returns best guess for name and size!
// --- OCR ENDPOINT --- Now crops to the target box!
app.post('/ocr', async (req, res) => {
  const { image, cropInfo } = req.body;
  if (!image) return res.status(400).json({ error: 'Missing image' });

  try {
    const buffer = Buffer.from(image, 'base64');
    const filename = `ocr_${Date.now()}.jpg`;
    fs.writeFileSync(filename, buffer);

    let processed = buffer;
    if (cropInfo && cropInfo.width && cropInfo.height && cropInfo.photoWidth && cropInfo.photoHeight) {
      // Map screen box to photo
      const scaleX = cropInfo.photoWidth / cropInfo.screenWidth;
      const scaleY = cropInfo.photoHeight / cropInfo.screenHeight;
      const extract = {
        left: Math.round(cropInfo.left * scaleX),
        top: Math.round(cropInfo.top * scaleY),
        width: Math.round(cropInfo.width * scaleX),
        height: Math.round(cropInfo.height * scaleY)
      };
      processed = await sharp(buffer)
        .extract(extract)
        .greyscale()
        .normalize()
        .sharpen()
        .toBuffer();
      fs.writeFileSync(`preprocessed_${Date.now()}.jpg`, processed);
    } else {
      // Preprocess full image if no crop info
      processed = await sharp(buffer)
        .greyscale()
        .normalize()
        .sharpen()
        .toBuffer();
      fs.writeFileSync(`preprocessed_${Date.now()}.jpg`, processed);
    }

    // OCR
    const result = await Tesseract.recognize(processed, 'eng', { logger: m => console.log(m) });

    // Use blocks and lines to guess "product name" (largest area)
    let bestLine = '';
    let bestHeight = 0;
    let bestSize = '';
    const allTextLines = [];

    if (result.data && Array.isArray(result.data.lines)) {
      result.data.lines.forEach(line => {
        const text = (line.text || '').trim();
        allTextLines.push(text);
        if (line.bbox && (line.bbox.y1 - line.bbox.y0) > bestHeight && text.length > 2) {
          bestHeight = line.bbox.y1 - line.bbox.y0;
          bestLine = text;
        }
        if (!bestSize) {
          const m = text.match(/(\d+(\.\d+)?\s?(ml|g|kg|oz|l|L|ML|KG|G|OZ))/i);
          if (m) bestSize = m[0];
        }
      });
    }

    if (!bestLine) bestLine = (result.data && result.data.text || '').split('\n').filter(l => l.trim().length > 2)[0] || '';
    if (!bestSize) {
      const m = (result.data && result.data.text || '').match(/(\d+(\.\d+)?\s?(ml|g|kg|oz|l|L|ML|KG|G|OZ))/i);
      if (m) bestSize = m[0];
    }

    res.json({
      bestName: bestLine,
      bestSize,
      text: result.data.text
    });
  } catch (e) {
    console.log('[OCR] Error during OCR:', e);
    res.status(500).json({ error: e.message });
  }
});
app.listen(3000, () => console.log('Listening on 3000'));
console.log('Supabase:', process.env.SB_URL, 'ServiceRole?', isServiceRole(process.env.SB_SERVICE_KEY));
