import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
dotenv.config();

export const r2 = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY,
        secretAccessKey: process.env.R2_SECRET_KEY,
    }
});

// Datei hochladen
export async function uploadToR2(file, filename) {
    const params = {
        Bucket: process.env.R2_BUCKET,
        Key: filename,
        Body: file.data,
        ContentType: file.mimetype,
    };

    await r2.send(new PutObjectCommand(params));

    return `${process.env.R2_PUBLIC_URL}/${filename}`;
}
