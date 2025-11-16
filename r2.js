// r2.js – stabiler R2-Upload für Temple of Logic

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const {
  R2_BUCKET_NAME,
  R2_ENDPOINT,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_PUBLIC_BASE_URL,
} = process.env;

let s3Client = null;

if (R2_BUCKET_NAME && R2_ENDPOINT && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY) {
  s3Client = new S3Client({
    region: "auto",
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
} else {
  console.log("R2: Umgebungsvariablen unvollständig – Uploads gehen ohne Bild-URL weiter.");
}

/**
 * Uploadt eine Datei nach R2.
 * Gibt bei Erfolg eine PUBLIC-URL zurück, sonst null.
 * Bricht NICHT den Server ab.
 */
export async function uploadToR2(file, key) {
  try {
    if (!s3Client || !R2_BUCKET_NAME || !R2_PUBLIC_BASE_URL) {
      console.log("R2: nicht konfiguriert – kein Upload, image_url bleibt null.");
      return null;
    }

    const body = file.data || file.buffer || file;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: body,
        ContentType: file.mimetype || "application/octet-stream",
      })
    );

    const safeKey = encodeURIComponent(key);
    return `${R2_PUBLIC_BASE_URL}/${safeKey}`;
  } catch (err) {
    console.error("R2 Upload Error:", err);
    return null;
  }
}
