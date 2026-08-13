import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

/**
 * Storage boundary for uploaded documents. `key` is always `{companyId}/{safeFileName}` — the
 * same tenant-scoped shape regardless of backend, so switching backends never touches the
 * companyId-prefix tenant-isolation logic in documents/service.ts.
 */
export interface DocumentStorage {
  write(key: string, buffer: Buffer): Promise<void>;
  read(key: string): Promise<Buffer>;
}

/** Default backend — local disk, outside `public/`. Fine for a single-instance pilot. */
export class LocalDocumentStorage implements DocumentStorage {
  constructor(private readonly root: string) {}

  private resolve(key: string) {
    const resolved = path.join(this.root, key);
    if (!resolved.startsWith(this.root)) throw new Error("مسار ملف غير صالح");
    return resolved;
  }

  async write(key: string, buffer: Buffer) {
    const resolved = this.resolve(key);
    await mkdir(path.dirname(resolved), { recursive: true });
    await writeFile(resolved, buffer);
  }

  async read(key: string) {
    return readFile(this.resolve(key));
  }
}

/**
 * Private-bucket S3-compatible backend (AWS S3, MinIO, DigitalOcean Spaces, Cloudflare R2, ...).
 * Never issues public URLs or presigned links — every read still goes through the authenticated,
 * tenant-checked /api/documents/[id] route, which streams the bytes server-side exactly like the
 * local backend does. Selected only when STORAGE_DRIVER=s3; inert otherwise.
 */
export class S3DocumentStorage implements DocumentStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(params: { bucket: string; region?: string; endpoint?: string; accessKeyId: string; secretAccessKey: string }) {
    this.bucket = params.bucket;
    this.client = new S3Client({
      region: params.region ?? "auto",
      endpoint: params.endpoint,
      forcePathStyle: Boolean(params.endpoint), // required by most non-AWS S3-compatible providers
      credentials: { accessKeyId: params.accessKeyId, secretAccessKey: params.secretAccessKey },
    });
  }

  async write(key: string, buffer: Buffer) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: buffer }));
  }

  async read(key: string) {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) throw new Error("تعذّر قراءة الملف من التخزين");
    return Buffer.from(bytes);
  }
}

function buildStorage(): DocumentStorage {
  if (process.env.STORAGE_DRIVER === "s3") {
    const bucket = process.env.S3_BUCKET;
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
    if (!bucket || !accessKeyId || !secretAccessKey) {
      throw new Error("STORAGE_DRIVER=s3 requires S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY to be set.");
    }
    return new S3DocumentStorage({
      bucket,
      accessKeyId,
      secretAccessKey,
      region: process.env.S3_REGION,
      endpoint: process.env.S3_ENDPOINT,
    });
  }

  // Deliberately OUTSIDE public/ — files must never be reachable by a bare static URL.
  return new LocalDocumentStorage(path.join(process.cwd(), "storage", "uploads"));
}

export const documentStorage: DocumentStorage = buildStorage();
