// src/storage/storage.service.js
const { createClient } = require('@supabase/supabase-js');
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = require('../config/env');

const bucket = 'numor-invoice-pdf-storage';

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { autoRefreshToken: false, persistSession: false }
  }
);

async function upload(key, buffer, contentType) {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(key, buffer, {
      contentType: contentType || 'application/pdf',
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

async function getSignedUrls(keys) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrls(keys, 900, {
      download: true
    });

  if (error) throw error;

  return data.reduce((acc, item) => {
    acc[item.path] = item.signedUrl;
    return acc;
  }, {});
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
  getSignedUrls,
  remove
};
