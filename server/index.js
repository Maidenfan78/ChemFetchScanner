// server/index.js
import express from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();
const app = express();
const supabase = createClient(process.env.SB_URL, process.env.SB_SERVICE_KEY);

app.use(express.json());

async function fetchGoogleLinks(barcode) {
  const res = await axios.get(`https://www.google.com/search?q=barcode+${encodeURIComponent(barcode)}`, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const $ = cheerio.load(res.data);
  const urls = [];
  $('.yuRUbf > a').each((i, el) => {
    if (i < 5) urls.push($(el).attr('href'));
  });
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
  } catch {
    return null;
  }
}

app.post('/scan', async (req, res) => {
  const { code } = req.body;
  const urls = await fetchGoogleLinks(code);
  const scraped = (await Promise.all(urls.map(scrapeProductInfo))).filter(Boolean);

  const top = scraped[0] || {};
  const { name, manufacturer, size, sdsUrl } = top;

  const { error } = await supabase
    .from('products')
    .insert([{ barcode: code, product_name: name, manufacturer, size, weight: size, sds_url: sdsUrl }]);
  if (error) return res.status(500).json({ error });

  res.json({ code, scraped });
});

app.listen(3000, () => console.log('Listening on port 3000'));
console.log('Supabase URL:', process.env.SB_URL);
console.log('Using service key?', process.env.SB_SERVICE_KEY?.includes('service_role'));
console.log('[DEBUG] SB_URL:', process.env.SB_URL);
console.log('[DEBUG] SB_SERVICE_KEY starts with:', process.env.SB_SERVICE_KEY?.slice(0, 30));
console.log('[DEBUG] Service key contains "service_role"?', process.env.SB_SERVICE_KEY?.includes('service_role'));

