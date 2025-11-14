// r2.js – Cloudflare R2 Helper (ESM)

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME;
const publicBase = process.env.R2_PUBLIC_BASE_URL; // z. B. https://deinbucket.r2.dev

if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
  console.warn("R2-Umgebungsvariablen sind nicht vollständig gesetzt.");
}

const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

export async function uploadToR2(file, key) {
  if (!file || !file.data) {
    throw new Error("Ungültige Datei für Upload");
  }

  const putCommand = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: file.data,
    ContentType: file.mimetype || "application/octet-stream",
  });

  await r2Client.send(putCommand);

  if (publicBase) {
    return `${publicBase.replace(/\/$/, "")}/${key}`;
  }

  return `https://${accountId}.r2.cloudflarestorage.com/${bucketName}/${key}`;
}
