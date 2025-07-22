# ChemFetchScanner

A cross-platform Expo app to scan EAN‑8/EAN‑13 barcodes, fetch product info (name, manufacturer, size/weight, SDS URL) from the web, and store results in Supabase.

---

## 🚀 Features

- **Scan barcodes** using `expo-camera` (EAN‑8, EAN‑13)
- **Backend service** fetches top 5 Google results and scrapes key product details using Axios + Cheerio
- **Stores data** in Supabase under `products` table with user-level row security
- **Built with Expo Router**, supported by modern React components
- **Confirm with photo** – capture an image after scanning and verify product name/size with OCR
- **Only barcode & name stored** to avoid inaccurate manufacturer data

---

## 🛠️ Tech Stack

- **📱 Frontend**: 
  - Expo (`expo-router`, `expo-camera`, TSX)
- **🚧 Backend**:
  - Node.js + Express
  - Axios & Cheerio for lightweight scraping
  - Tesseract.js for OCR image recognition
  - Supabase for authentication & Postgres storage
- **ℹ️ DB Schema**:
  - `products` table with fields like `barcode`, `product_name`, `manufacturer`, `size`, and `sds_url`

---

## 🔧 Setup

### 1️⃣ Clone & install

```bash
git clone <repo-url>
cd ChemFetchScanner

# Install mobile dependencies
npm install

# Setup backend
cd server
npm install
2️⃣ Add Supabase credentials
In /server/.env:

ini
Copy
@@ -49,51 +52,59 @@ Edit
SB_URL=https://<your-supabase-project>.supabase.co
SB_SERVICE_KEY=<service-role-secret>
3️⃣ Run backend
bash
Copy
Edit
cd server
npm start
# Server should output: "Listening on port 3000"
4️⃣ Run mobile app
Back in root:

bash
Copy
Edit
expo start
Scan QR code and test both "Scanner" and "Scan Results" tabs.

🧩 Usage Flow
Mobile App:

Grant camera permission and scan barcode → navigates to Results screen

App calls backend /scan endpoint with scanned code + user_id

Server stores barcode and product name then returns scraped results

User can tap **Confirm with Photo** on the results screen

App captures an image and sends it to the /ocr endpoint

Text is extracted and compared with the scraped name/size

Displays whether the photo matches the product

Backend Logic:

/scan: uses axios to fetch Google search, parses top URLs

Scrapes each page for <h1>, brand, size/weight patterns, SDS PDF links

Stores best match into Supabase via supabase-js

📦 Migration
The following SQL migration creates the products table:

sql
Copy
Edit
create table public.products (
  id bigint primary key generated always as identity,
  user_id uuid not null references auth.users(id),
  barcode text not null,
  product_name text,
  manufacturer text,
  size text,
  weight text,
  sds_url text,
  created_at timestamptz not null default now()