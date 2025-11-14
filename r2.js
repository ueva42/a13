// r2.js – Cloudflare R2 Upload

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL; // z.B. https://cdn.deine-domain.de

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME || !R2_PUBLIC_BASE_URL) {
  console.warn("⚠️ R2 ENV Variablen sind nicht vollständig gesetzt.");
}

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

export async function uploadToR2(file, key) {
  if (!file || !file.data) throw new Error("Keine Datei übergeben");

  const cmd = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: file.data,
    ContentType: file.mimetype || "application/octet-stream",
  });

  await s3.send(cmd);

  // Öffentliche URL (über dein CDN / Public Domain)
  return `${R2_PUBLIC_BASE_URL}/${encodeURIComponent(key)}`;
}
