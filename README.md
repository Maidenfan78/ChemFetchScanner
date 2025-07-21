# ChemFetchScanner

A cross-platform Expo app to scan EAN‑8/EAN‑13 barcodes, fetch product info (name, manufacturer, size/weight, SDS URL) from the web, and store results in Supabase.

---

## 🚀 Features

- **Scan barcodes** using `expo-camera` (EAN‑8, EAN‑13)
- **Backend service** fetches top 5 Google results and scrapes key product details using Axios + Cheerio
- **Stores data** in Supabase under `products` table with user-level row security
- **Built with Expo Router**, supported by modern React components

---

## 🛠️ Tech Stack

- **📱 Frontend**: 
  - Expo (`expo-router`, `expo-camera`, TSX)
- **🚧 Backend**:
  - Node.js + Express
  - Axios & Cheerio for lightweight scraping
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
Edit
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

Receives scraped data and renders product details

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
);

-- RLS
alter table public.products enable row level security;

create policy "authenticated_insert_own"
  on public.products for insert
  with check (auth.uid() = user_id);
create policy "authenticated_select_own"
  on public.products for select
  using (auth.uid() = user_id);
🧪 Development Tips
Replace scraping logic with Puppeteer for dynamic sites

Add deduplication and feedback for scanning results

Manage rate limits and user quotas in backend

Write unit/integration tests for Express and Supabase interactions

📚 References
Expo expo-camera barcode scanning guide 
DEV Community
+2
GitHub
+2
GitHub
+2
DEV Community
+15
Expo Documentation
+15
GeeksforGeeks
+15
GitHub
npm
GitHub
GitHub
+1
GitHub
+1
GitHub
+4
GitHub
+4
GitHub
+4
GitHub
+3
johna.hashnode.dev
+3
Bootstrapped
+3

Simple Node.js + Supabase + Express examples 
DEV Community
Bootstrapped

Axios + Cheerio scraping tutorials 
GitHub

✅ Contributing
Fork the repo

Install dependencies

Add your feature or fix

Submit a PR

Please include:

Context and motivation

Screenshots/mockups

Compatibility notes (OS, SDK versions, etc.)

Licensed under MIT. 😊

yaml
Copy
Edit

---

### 🧭 Notes

- **Replace `<repo-url>`** with the actual repository address.
- **Ensure citation format includes web sources**; the citations above reference all key sources used.
- You can adjust the flow based on your scraper/backend updates, such as adding UI for multiple results.

Let me know if you'd like a CI/CD setup, EAS build config, or additional documentation sections!
::contentReference[oaicite:21]{index=21}S