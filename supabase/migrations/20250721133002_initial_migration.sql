CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  barcode TEXT NOT NULL,
  product_name TEXT,
  manufacturer TEXT,
  contents_size_weight TEXT,
  sds_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);
