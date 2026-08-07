import { createClient } from '@supabase/supabase-js';

let cachedClient = null;
let cachedConfig = null;

export async function getConfig() {
  const { supabaseUrl, supabaseKey } = await chrome.storage.local.get(['supabaseUrl', 'supabaseKey']);
  return { supabaseUrl: supabaseUrl || '', supabaseKey: supabaseKey || '' };
}

export async function setConfig(supabaseUrl, supabaseKey) {
  await chrome.storage.local.set({ supabaseUrl, supabaseKey });
  cachedClient = null;
  cachedConfig = null;
}

export async function isConfigured() {
  const { supabaseUrl, supabaseKey } = await getConfig();
  return !!(supabaseUrl && supabaseKey);
}

export async function getClient() {
  const config = await getConfig();
  if (!config.supabaseUrl || !config.supabaseKey) return null;
  if (cachedClient && cachedConfig?.supabaseUrl === config.supabaseUrl && cachedConfig?.supabaseKey === config.supabaseKey) {
    return cachedClient;
  }
  cachedClient = createClient(config.supabaseUrl, config.supabaseKey);
  cachedConfig = config;
  return cachedClient;
}
