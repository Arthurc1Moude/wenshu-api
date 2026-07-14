import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '..', 'uploads');

const R2_ENABLED = !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME);
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || '';

let s3Client = null;
if (R2_ENABLED) {
  s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
    }
  });
}

export function isR2Enabled() {
  return R2_ENABLED;
}

export function getPublicUrl(storedFilename) {
  if (R2_ENABLED && R2_PUBLIC_URL) {
    return `${R2_PUBLIC_URL.replace(/\/$/, '')}/${storedFilename}`;
  }
  return `/uploads/${storedFilename}`;
}

export async function saveFile(storedFilename, filePath, mimetype = 'application/octet-stream') {
  if (R2_ENABLED) {
    const fileContent = fs.readFileSync(filePath);
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: storedFilename,
      Body: fileContent,
      ContentType: mimetype
    }));
    try { fs.unlinkSync(filePath); } catch(e) {}
    return;
  }
}

export async function deleteFile(storedFilename) {
  if (R2_ENABLED) {
    try {
      await s3Client.send(new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: storedFilename
      }));
    } catch(e) {
      console.error('R2 delete error:', e.message);
    }
    return;
  }
  const localPath = path.join(uploadsDir, storedFilename);
  if (fs.existsSync(localPath)) {
    try { fs.unlinkSync(localPath); } catch(e) {}
  }
}

export async function fileExists(storedFilename) {
  if (R2_ENABLED) {
    try {
      await s3Client.send(new HeadObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: storedFilename
      }));
      return true;
    } catch(e) {
      return false;
    }
  }
  return fs.existsSync(path.join(uploadsDir, storedFilename));
}

export async function getFileStream(storedFilename) {
  if (R2_ENABLED) {
    const resp = await s3Client.send(new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: storedFilename
    }));
    return resp.Body;
  }
  return fs.createReadStream(path.join(uploadsDir, storedFilename));
}

export async function getSignedDownloadUrl(storedFilename, expiresIn = 3600) {
  if (R2_ENABLED && R2_PUBLIC_URL) {
    return getPublicUrl(storedFilename);
  }
  if (R2_ENABLED) {
    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: storedFilename
    });
    return await getSignedUrl(s3Client, command, { expiresIn });
  }
  return `/uploads/${storedFilename}`;
}

export function getLocalUploadDir() {
  return uploadsDir;
}
