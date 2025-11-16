// r2.js
import {
  S3Client,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import dotenv from "dotenv";
dotenv.config();

const client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

export async function uploadToR2(file, filename) {
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: filename,
      Body: file.data,
      ContentType: file.mimetype,
    })
  );

  let base = process.env.R2_PUBLIC_BASE_URL;

  // **Fix: Doppeltes Bucket verhindern**
  const hasBucket = base.includes(process.env.R2_BUCKET_NAME);
  if (!hasBucket) {
    base = `${base.replace(/\/$/, "")}/${process.env.R2_BUCKET_NAME}`;
  }

  return `${base}/${filename}`;
}
