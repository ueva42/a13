// -------------------------------------------------------------
// R2 KONFIGURATION (Cloudflare R2 + AWS SDK kompatibel)
// -------------------------------------------------------------
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const R2_ENABLED = Boolean(
  process.env.R2_ACCOUNT_ID &&
  process.env.R2_BUCKET_NAME &&
  process.env.R2_PUBLIC_BASE_URL &&
  process.env.R2_ACCESS_KEY_ID &&
  process.env.R2_SECRET_ACCESS_KEY
);

let r2 = null;

if (R2_ENABLED) {
  r2 = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

// Upload-Helper
async function uploadToR2(buffer, filename, mimetype) {
  if (!R2_ENABLED) return null;

  const key = `uploads/${Date.now()}-${filename}`;

  await r2.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: mimetype
    })
  );

  return `${process.env.R2_PUBLIC_BASE_URL}/${process.env.R2_BUCKET_NAME}/${key}`;
}

export { uploadToR2, R2_ENABLED };
