// src/storage/storage.service.js
const { createClient } = require('@supabase/supabase-js');

const bucket = 'numor-invoice-pdf-storage';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { autoRefreshToken: false, persistSession: false }
  }
);

async function upload(key, buffer) {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(key, buffer, {
      contentType: 'application/pdf',
      upsert: true
    });

  if (error) throw error;
  return key;
}

async function getSignedUrl(key) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(key, 900, {
      download: true
    });

  if (error) throw error;
  return data.signedUrl;
}

async function remove(key) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .remove([key]); // must be array

  if (error) throw error;

  return data;
}
  
module.exports = {
  upload,
  getSignedUrl,
  remove
};
