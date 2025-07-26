# ChemFetchScanner

ChemFetchScanner is a cross-platform mobile app built with Expo Router. It scans EAN‑8 and EAN‑13 barcodes, looks up product details on the web and stores them in a Supabase database. The backend searches Bing using a headless browser and falls back to a lightweight scraper when necessary. A separate Python OCR microservice now handles label recognition.

---

## Features

- **Barcode scanning** with `expo-camera`.
- **Bing search** via headless Puppeteer (fallback to Cheerio).
- **Database first** – if a scanned code already exists, saved details are returned immediately.
- **Web scraping** of result pages for product name and size when a code is unknown.
- **Image confirmation** – capture a focused photo of the product label, crop it with adjustable handles and run OCR via the Python service.
- **Mismatch choice** – compare OCR results with scraped text, then choose which to keep or enter details manually.
- **SDS link detection** for safety data sheets.
- **Supabase storage** for final name and size.
- **GPU check** endpoint at `/gpu-check` to verify PaddleOCR is using CUDA.

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
  size TEXT,
  weight TEXT,
  sds_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);
```

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

All colors meet WCAG 2.1 AA contrast requirements. Defined in [`apps/mobile/src/constants/Colors.ts`](apps/mobile/src/constants/Colors.ts).

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
   pip install server/python/vendor/*
   ```
   All Python wheels required by the OCR service are stored in `server/python/vendor`.
3. **Configure the backend**
   ```bash
   cd server/node
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
   node server/node/index.js
   ```
5. **Start the OCR service**
   ```bash
   python server/python/ocr_service.py
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
3. If not found, the server searches Bing, scrapes a few pages and returns the best guess for name and size.
4. The user is prompted to take a close photo of the item label.
5. OCR runs on the cropped label to extract a name and size.
6. The scraped and OCR results are shown so the user can choose one of the two or manually add Item name and wight/size/contents.
7. The chosen details are saved back to Supabase.

This cropped approach avoids extra artwork confusing the OCR and improves size detection.

## Future Work

Still to add to the code:

1. The code will scrape the web for `sds_url`. The best approach for this is still being evaluated.
2. The code will store the URL in the `products` table under `sds_url`. 
3. The `size` and `weight` fields will be merged since they are effectively the same value.

Bellow is either going to be it's own app or ChemfetchScanner will becom the ChecmFetch app. This app is going to be used by companies, schools, etc where the OH&S or workers need a single or easy access to stored checmicals SDS. It will also aid the OH&S officer in keeping in date SDS sheets and will automaticlay parse data from the SDS sheet to this app with relevent data.
4. A way to parse the SDS contents so to a new data base.
5. Add a desktop app or web app where the user can access the checmical SDS/parsed data they have scanned with this ChemFetchScanner
6. Determina what data to be parsed to CSV/Database


*** Current folder structure.
## Folder Structure

```txt
.
├── AGENTS_AND_TEAM.md          # Persona briefs and operating principles
├── docs/
│   ├── README.md               # Project documentation
│   └── FOLDER_STRUCTURE.txt    # High-level directory map
├── apps/
│   └── mobile/
│       ├── app/                # Expo Router pages and screens
│       ├── assets/             # Fonts and images
│       ├── components/         # Reusable React Native components
│       ├── constants/          # Shared constants (e.g. colors)
│       └── tsconfig.json       # TypeScript config for mobile app
├── server/
│   ├── node/                   # Express backend + Puppeteer scraping
│   └── python/                 # OCR service using PaddleOCR
│       ├── ocr_service.py
│       └── vendor/             # Pre-built Python wheels
├── scripts/
│   └── python/                 # Future SDS parsing and tools
├── supabase/
│   ├── database.types.ts       # Supabase typed client schema
│   └── migrations/             # SQL schema migrations
├── .env.example                # Sample environment variables
├── package.json                # Root-level dependencies and scripts
└── tsconfig.json               # Shared TypeScript config


15 directories, 34 files