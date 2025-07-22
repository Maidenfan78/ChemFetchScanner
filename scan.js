import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SB_URL,
  process.env.SB_SERVICE_KEY
);

(async () => {
  const { data, error } = await supabase
    .from('products')
    .insert([{ barcode: '9312240220014' }]);
  if (error) {
    console.error('Insert error:', error);
  } else {
    console.log('Insert successful:', data);
  }
})();
