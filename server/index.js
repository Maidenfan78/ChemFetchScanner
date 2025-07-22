import express from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

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

app.use(express.json());

/**
 * Fetch up to 5 result URLs for a barcode search by parsing Google’s redirection links.
 * This uses the /url?q= pattern, which is more stable than page-specific selectors.
 */
async function fetchGoogleLinks(barcode) {
  const searchUrl = `https://www.google.com/search?hl=en&gl=us&q=barcode+${encodeURIComponent(barcode)}`;
  const res = await axios.get(searchUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });
  const $ = cheerio.load(res.data);
  const urls = [];

  $('a[href^="/url?q="]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const match = href.match(/^\/url\?q=([^&]+)/);
    if (match) {
      const link = decodeURIComponent(match[1]);
      if (link.startsWith('http')) {
        urls.push(link);
      }
    }
    if (urls.length >= 5) return false;  // break out once we have 5
  });

  console.log('Google returned URLs:', urls);
  return urls;
}

async function scrapeProductInfo(url) {
  try {
    const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(data);
    const name = $('h1').first().text().trim();
    const manufacturer = $('[itemprop="manufacturer"], .brand').first().text().trim();
    const sizeMatch = $('body').text().match(/(\d+(\.\d+)?\s?(ml|g|kg|oz|l))/i);
    const size = sizeMatch ? sizeMatch[0] : '';
    const sdsUrl = $('a[href$=".pdf"]')
      .filter((_, a) => $(a).attr('href').toLowerCase().includes('sds'))
      .attr('href') || '';
    return { url, name, manufacturer, size, sdsUrl };
  } catch (err) {
    console.warn(`Failed to scrape ${url}:`, err.message);
    return null;
  }
}

app.post('/scan', async (req, res) => {
  const { code } = req.body;

  // 1. fetch Google result URLs for this barcode
  const urls = await fetchGoogleLinks(code);

  // 2. scrape each URL for SDS info
  const scraped = (await Promise.all(urls.map(scrapeProductInfo))).filter(Boolean);
  console.log('Scraped data:', scraped);

  // 3. insert the best hit
  const top = scraped[0] || {};
  const { name = '', manufacturer = '', size = '', sdsUrl = '' } = top;

  const { error } = await supabase
    .schema('public')
    .from('products')
    .insert([{ barcode: code, product_name: name, manufacturer, size, weight: size, sds_url: sdsUrl }]);

  if (error) {
    console.error('Insert error:', error);
    return res.status(500).json({ error });
  }

  // 4. respond with raw scraped data for debugging
  res.json({ code, scraped });
});

app.listen(3000, () => console.log('Listening on port 3000'));

// debug-info console logs
console.log('Supabase URL:', process.env.SB_URL);
console.log('Using service key?', isServiceRole(process.env.SB_SERVICE_KEY));
