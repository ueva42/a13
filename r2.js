// r2.js – R2 Upload Helper

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL; // z. B. https://<dein-public-domain>

const hasR2Config =
  R2_ACCESS_KEY_ID &&
  R2_SECRET_ACCESS_KEY &&
  R2_ACCOUNT_ID &&
  R2_BUCKET_NAME &&
  R2_PUBLIC_BASE_URL;

let s3Client = null;

if (hasR2Config) {
  s3Client = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
} else {
  console.warn("R2-Umgebungsvariablen sind nicht vollständig gesetzt. Nutze lokalen Fallback.");
}

/**
 * file: Objekt von express-fileupload
 * filename: Ziel-Dateiname
 * Rückgabe: öffentliche URL (R2 oder lokal)
 */
export async function uploadToR2(file, filename) {
  if (!hasR2Config || !s3Client) {
    throw new Error("R2 nicht konfiguriert");
  }

  const cmd = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: filename,
    Body: file.data,
    ContentType: file.mimetype || "application/octet-stream",
  });

  await s3Client.send(cmd);

  // Öffentliche URL (über dein R2 Public Base URL / CDN)
  return `${R2_PUBLIC_BASE_URL.replace(/\/$/, "")}/${filename}`;
}
