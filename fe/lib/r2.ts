import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME!;
const R2_ENDPOINT_URL = process.env.R2_ENDPOINT_URL!;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL!;

// Initialize S3 Client for Cloudflare R2
const S3 = new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT_URL,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

export async function uploadToR2(
  fileBuffer: Buffer | Uint8Array,
  key: string,
  contentType: string
): Promise<string> {
  try {
    await S3.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: fileBuffer,
        ContentType: contentType,
      })
    );

    return `${R2_PUBLIC_URL}/${key}`;
  } catch (error) {
    console.error("Error uploading to R2:", error);
    throw new Error("Failed to upload image to storage");
  }
}
