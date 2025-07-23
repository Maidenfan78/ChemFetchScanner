# ChemFetchScanner

ChemFetchScanner is a cross-platform mobile app built with Expo Router. It scans EAN-8 and EAN-13 barcodes, looks up product details on the web and stores them in a Supabase database. The backend now searches Bing using a headless browser and falls back to a lightweight scraper when necessary.

---

## Features

- **Barcode scanning** with `expo-camera`.
- **Bing search** via headless Puppeteer (fallback to Cheerio).
- **Database first** – if a scanned code already exists, saved details are returned immediately.
- **Web scraping** of result pages for product name and size when a code is unknown.
- **Image confirmation** – capture a focused photo of the product label and run OCR with Tesseract.
- **Mismatch choice** – compare OCR results with scraped text, then choose which to keep or enter details manually.
- **Supabase storage** for final name and size.

---

## Tech Stack

- **Frontend:** Expo (`expo-router`, `expo-camera`)
- **Backend:** Node.js + Express, Puppeteer, Cheerio, Tesseract.js
- **Database:** Supabase Postgres

The `products` table contains:

```sql
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  barcode TEXT NOT NULL,
  product_name TEXT,
  manufacturer TEXT,
  size TEXT,
  weight TEXT,
  sds_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);
```

---

## Setup

1. **Clone and install**
   ```bash
   git clone <repo-url>
   cd ChemFetchScanner
   npm install
   ```
2. **Configure the backend**
   ```bash
   cd server
   npm install
   cp .env.example .env    # create and edit with your Supabase keys
   ```
   The `.env` file requires:
   ```ini
   SB_URL=https://<project>.supabase.co
   SB_SERVICE_KEY=<service-role-secret>
   ```
3. **Run the backend**
   ```bash
   npm start
   ```
4. **Run the mobile app** (from the project root)
   ```bash
   npm start
   ```
5. **Run tests**
   ```bash
   npm test
   ```

---

## Workflow

1. Scan a barcode in the app.
2. The server checks Supabase – if the barcode exists, stored data is returned.
3. If not found, the server searches Bing, scrapes a few pages and returns the best guess for name and size.
4. The user is prompted to take a close photo of the item label.
5. OCR runs on the cropped label to extract a name and size.
6. The scraped and OCR results are shown so the user can choose or manually edit.
7. The chosen details are saved back to Supabase.

This cropped approach avoids extra artwork confusing the OCR and improves size detection.
