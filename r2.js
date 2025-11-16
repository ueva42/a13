// r2.js – Cloudflare R2 Anbindung

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const {
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_ACCOUNT_ID,
  R2_BUCKET_NAME,
  R2_PUBLIC_BASE_URL,
} = process.env;

/**
 * Sind alle nötigen Variablen gesetzt?
 */
export const r2Configured = Boolean(
  R2_ACCESS_KEY_ID &&
    R2_SECRET_ACCESS_KEY &&
    R2_ACCOUNT_ID &&
    R2_BUCKET_NAME &&
    R2_PUBLIC_BASE_URL
);

let s3Client = null;

if (r2Configured) {
  s3Client = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
  console.log("R2: konfiguriert, Uploads aktiviert.");
} else {
  console.log("R2: NICHT vollständig konfiguriert – Uploads ohne Bild-URL.");
}

/**
 * Datei nach R2 hochladen.
 * file: Objekt von express-fileupload (file.data, file.mimetype, file.name)
 * key:  Dateiname im Bucket (z. B. "mission_123.png")
 * Rückgabe: öffentliche URL oder null bei Fehler
 */
export async function uploadToR2(file, key) {
  if (!r2Configured || !s3Client) {
    console.log("R2: nicht konfiguriert – Upload übersprungen.");
    return null;
  }

  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: file.data,
        ContentType: file.mimetype || "application/octet-stream",
      })
    );

    const base = R2_PUBLIC_BASE_URL.replace(/\/+$/, "");
    return `${base}/${encodeURIComponent(key)}`;
  } catch (err) {
    console.error("R2 Upload Error:", err);
    return null; // App läuft weiter, nur ohne Bild
  }
}
