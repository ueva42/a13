// r2.js – Railway + Cloudflare R2 upload helper

import {
  S3Client,
  PutObjectCommand
} from "@aws-sdk/client-s3";

import dotenv from "dotenv";
dotenv.config();

if (!process.env.R2_ACCESS_KEY_ID ||
    !process.env.R2_SECRET_ACCESS_KEY ||
    !process.env.R2_BUCKET_NAME ||
    !process.env.R2_ACCOUNT_ID) {
  console.log("⚠️ R2-Umgebungsvariablen sind nicht vollständig gesetzt.");
}

const endpoint = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

const client = new S3Client({
  region: "auto",
  endpoint,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});

export async function uploadToR2(file, filename) {

  await client.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: filename,
    Body: file.data,
    ContentType: file.mimetype
  }));

  // Öffentliche URL
  return `${process.env.R2_PUBLIC_BASE_URL}/${filename}`;
}
