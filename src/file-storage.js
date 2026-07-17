import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

let s3Client = null;
let useS3 = false;
const S3_BUCKET = process.env.S3_BUCKET || process.env.R2_BUCKET_NAME || '';
const S3_ENDPOINT = process.env.S3_ENDPOINT || process.env.R2_ENDPOINT || '';
const S3_PUBLIC_URL = process.env.S3_PUBLIC_URL || (S3_ENDPOINT && S3_BUCKET ? `${S3_ENDPOINT}/${S3_BUCKET}` : '');

async function initS3() {
  if (useS3) return;
  const accessKey = process.env.S3_ACCESS_KEY || process.env.R2_ACCESS_KEY_ID || '';
  const secretKey = process.env.S3_SECRET_KEY || process.env.R2_SECRET_ACCESS_KEY || '';
  const region = process.env.S3_REGION || 'auto';

  if (!S3_BUCKET || !accessKey || !secretKey) {
    console.log('📁 No S3/R2 configured - using local file storage');
    useS3 = false;
    return;
  }

  try {
    const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    s3Client = new S3Client({
      region,
      endpoint: S3_ENDPOINT || undefined,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
      forcePathStyle: !!S3_ENDPOINT,
    });
    useS3 = true;
    console.log(`☁️  S3/R2 cloud storage enabled (bucket: ${S3_BUCKET})`);
  } catch (e) {
    console.warn('⚠️  Failed to initialize S3 client, falling back to local storage:', e.message);
    useS3 = false;
  }
}

function getLocalDir() {
  let dirname;
  try {
    const fileUrl = new URL(import.meta.url);
    dirname = path.dirname(fileUrl.pathname);
    if (process.platform === 'win32' && dirname.startsWith('/')) {
      dirname = dirname.substring(1);
    }
  } catch (e) {
    dirname = process.cwd();
  }
  const dir = path.join(dirname, '..', 'uploads');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getExtFromMime(mime) {
  const map = {
    'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif',
    'image/webp': '.webp', 'image/bmp': '.bmp',
    'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/x-msvideo': '.avi',
    'video/webm': '.webm', 'video/3gpp': '.3gp',
    'audio/mpeg': '.mp3', 'audio/wav': '.wav', 'audio/ogg': '.ogg',
    'application/pdf': '.pdf',
    'application/zip': '.zip', 'application/x-rar-compressed': '.rar',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/vnd.ms-powerpoint': '.ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
    'text/plain': '.txt', 'text/csv': '.csv', 'application/json': '.json',
  };
  return map[mime] || '';
}

export async function uploadFile(buffer, originalName, mimeType) {
  if (useS3 && s3Client) {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const ext = path.extname(originalName) || getExtFromMime(mimeType);
    const key = `uploads/${uuidv4()}${ext}`;
    await s3Client.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimeType || 'application/octet-stream',
    }));
    return { key, storageType: 's3' };
  } else {
    const dir = getLocalDir();
    const ext = path.extname(originalName) || getExtFromMime(mimeType);
    const filename = `${uuidv4()}${ext}`;
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, buffer);
    return { key: filename, storageType: 'local' };
  }
}

export async function deleteFile(storedKey, storageType) {
  try {
    if (storageType === 's3' && useS3 && s3Client) {
      const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      const key = storedKey.startsWith('uploads/') ? storedKey : `uploads/${storedKey}`;
      await s3Client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    } else {
      const dir = getLocalDir();
      const filePath = path.join(dir, storedKey);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  } catch (e) {
    console.warn('Failed to delete file:', storedKey, e.message);
  }
}

export function getFileUrl(storedKey, storageType) {
  if (storageType === 's3') {
    const key = storedKey.startsWith('uploads/') ? storedKey : `uploads/${storedKey}`;
    return S3_PUBLIC_URL ? `${S3_PUBLIC_URL}/${key}` : `/api/files/serve/${encodeURIComponent(storedKey)}`;
  }
  return `/uploads/${storedKey}`;
}

export async function getFileStream(storedKey, storageType) {
  if (storageType === 's3' && useS3 && s3Client) {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const key = storedKey.startsWith('uploads/') ? storedKey : `uploads/${storedKey}`;
    const cmd = new GetObjectCommand({ Bucket: S3_BUCKET, Key: key });
    const response = await s3Client.send(cmd);
    return { stream: response.Body, contentLength: response.ContentLength, contentType: response.ContentType };
  } else {
    const dir = getLocalDir();
    const filePath = path.join(dir, storedKey);
    if (!fs.existsSync(filePath)) return null;
    const stat = fs.statSync(filePath);
    return { stream: fs.createReadStream(filePath), contentLength: stat.size, contentType: null };
  }
}

export async function initStorage() {
  await initS3();
  getLocalDir();
}

export function isUsingCloud() {
  return useS3;
}

export function getStorageStats() {
  return { useS3, bucket: S3_BUCKET };
}

export function cleanupExpiredFilesLocal() {
  if (useS3) return;
  const dir = getLocalDir();
  const files = fs.readdirSync(dir);
  let totalSize = 0;
  for (const f of files) {
    try {
      const fp = path.join(dir, f);
      const stat = fs.statSync(fp);
      totalSize += stat.size;
    } catch {}
  }
  return { count: files.length, totalSize };
}
