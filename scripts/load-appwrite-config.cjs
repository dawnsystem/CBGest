'use strict';
const fs = require('fs');
const path = require('path');
const PROJECT_ROOT = path.resolve(__dirname, '..');
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadEnvFile(path.join(PROJECT_ROOT, '.env'));
loadEnvFile(path.join(PROJECT_ROOT, '.env.local'));
function firstEnv(keys, fallback) {
  for (const key of keys) {
    const value = process.env[key];
    if (value && String(value).trim()) return String(value).trim();
  }
  return fallback;
}
function getAppwriteConfig() {
  const bucketId = firstEnv(['APPWRITE_BUCKET_ID', 'VITE_APPWRITE_BUCKET_ID'], '691f31c9000fc8c83ab1');
  return {
    endpoint: firstEnv(['APPWRITE_ENDPOINT', 'VITE_APPWRITE_ENDPOINT'], 'https://fra.cloud.appwrite.io/v1'),
    projectId: firstEnv(['APPWRITE_PROJECT_ID', 'VITE_APPWRITE_PROJECT_ID'], 'cbgest'),
    databaseId: firstEnv(['APPWRITE_DATABASE_ID', 'VITE_APPWRITE_DATABASE_ID'], '691f288100019843d43e'),
    storageBucketId: bucketId,
    bucketId,
  };
}
module.exports = { getAppwriteConfig };
