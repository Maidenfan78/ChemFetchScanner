# ChemFetchScanner

ChemFetchScanner is a cross-platform mobile app built with Expo Router. It scans EAN‑8 and EAN‑13 barcodes, looks up product details on the web and stores them in a Supabase database. The backend searches Bing using a headless browser and falls back to a lightweight scraper when necessary. A separate Python OCR microservice now handles label recognition.

---

## Features

- **Barcode scanning** with `expo-camera`.
- **Bing search** via headless Puppeteer (fallback to Cheerio).
- **Database first** – if a scanned code already exists, saved details are returned immediately.
- **Web scraping** of result pages for product name and size/weight when a code is unknown.
- **Image confirmation** – capture a focused photo of the product label, crop it with adjustable handles and run OCR via the Python service.
- **Mismatch choice** – compare OCR results with scraped text, then choose which to keep or enter details manually.
- **SDS link detection** for safety data sheets.
- **SDS search** via `/sds-by-name` endpoint using product names.
- **Supabase storage** for final name and size/weight.
- **GPU check** endpoint at `/gpu-check` to verify PaddleOCR is using CUDA.

---
## 🎨 Color Scheme

| Purpose             | Color Name     | Hex       |
|---------------------|----------------|-----------|
| Primary             | Deep Indigo    | `#3A3D98` |
| Secondary           | Soft Orange    | `#FFA552` |
| Accent (Success)    | Lime Green     | `#80C900` |
| Error/Warning       | Safety Red     | `#D32F2F` |
| Background (Light)  | Off-white      | `#F5F7FA` |
| Background (Dark)   | Rich Charcoal  | `#1C1C1E` |
| Text (Light)        | Charcoal       | `#1F2933` |
| Text (Dark)         | Light Gray     | `#F2F2F2` |
| Borders/Dividers    | Slate Gray     | `#CBD2D9` |
| Button Hover        | Royal Blue Tint| `#4F52B6` |

All colors meet WCAG 2.1 AA contrast requirements. Defined in [`/constants/Colors.ts`](/constants/Colors.ts).

---

## Tech Stack

- **Frontend:** Expo (`expo-router`, `expo-camera`)
- **Backend:** Node.js + Express with a Python (PaddleOCR) microservice, Puppeteer, Cheerio
- **Database:** Supabase Postgres

The `products` table contains:

```sql
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  barcode TEXT NOT NULL,
  product_name TEXT,
  manufacturer TEXT,
  contents_size_weight TEXT,
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
2. **Install OCR dependencies**
   ```bash
   pip install vendor/*
   ```
   All Python wheels required by the OCR service are stored in the `/vendor` folder.
3. **Configure the backend**
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
4. **Run the backend**
   ```bash
    node server/index.js
   ```
5. **Start the OCR service**
   ```bash
   python ocr_service.py
   ```
6. **Run the mobile app** (from the project root)
   ```bash
   npm start
   ```
7. **Run tests**
   ```bash
   npm test
   ```
8. **Format code**
   ```bash
   npm run format
   ```

---

## Workflow

1. Scan a barcode in the app.
2. The server checks Supabase – if the barcode exists, stored data is returned.
3. If not found, the server searches Bing, scrapes a few pages and returns the best guess for name and size/weight.
4. The user is prompted to take a close photo of the item label.
5. OCR runs on the cropped label to extract a name and size/weight.
6. The scraped and OCR results are shown so the user can choose or manually edit.
7. The chosen details are saved back to Supabase.

This cropped approach avoids extra artwork confusing the OCR and improves size detection.

🚧 Roadmap

✅ = done | 🔄 = in progress | ⏳ = planned

🔄 Scrape SDS URL directly from product pages
🔄 Store SDS link in Supabase sds_url column
✅ Merge size and weight fields into one
⏳ Parse SDS PDF contents into structured fields
⏳ Add web/desktop app for SDS browsing
⏳ Export SDS details to CSV or searchable DB

## Folder & File structure

.
├── AGENTS.md
├── FOLDER_STRUCTURE.txt
├── README.md
├── android
│   ├── app
│   ├── build.gradle
│   ├── gradle
│   ├── gradle.properties
│   ├── gradlew
│   ├── gradlew.bat
│   └── settings.gradle
├── app
│   ├── (tabs)
│   ├── +html.tsx
│   ├── +not-found.tsx
│   ├── _layout.tsx
│   └── modal.tsx
├── app.json
├── assets
│   ├── fonts
│   └── images
├── components
│   ├── EditScreenInfo.tsx
│   ├── ExternalLink.tsx
│   ├── StyledText.tsx
│   ├── Themed.tsx
│   ├── __tests__
│   ├── useClientOnlyValue.ts
│   ├── useClientOnlyValue.web.ts
│   ├── useColorScheme.ts
│   └── useColorScheme.web.ts
├── constants
│   └── Colors.ts
├── ocr_service.py
├── package-lock.json
├── package.json
├── requirements.txt
├── server
│   ├── app.json
│   ├── eng.traineddata
│   ├── index.js
│   ├── package-lock.json
│   ├── package.json
│   └── preprocessed_1753394664613.jpg
├── supabase
│   ├── database.types.ts
│   └── migrations
└── tsconfig.json

15 directories, 34 files