import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectVersionsCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ConfigService } from '../config/config.service';

@Injectable()
export class S3StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  constructor(config: ConfigService) {
    this.bucket = config.get('S3_BUCKET');
    this.client = new S3Client({ region: config.get('AWS_REGION'), maxAttempts: 3,
      ...(config.optional('S3_ENDPOINT') ? { endpoint: config.optional('S3_ENDPOINT'), forcePathStyle: true } : {}),
      requestHandler: { connectionTimeout: 5000, requestTimeout: 120000 },
    });
  }
  async put(objectKey: string, buffer: Buffer, contentType: string, sha256: string) {
    const response = await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: objectKey, Body: buffer,
      ContentType: contentType, ContentLength: buffer.length, ServerSideEncryption: 'AES256',
      ChecksumSHA256: Buffer.from(sha256, 'hex').toString('base64'), Metadata: { sha256 },
    }));
    return { versionId: response.VersionId };
  }
  async remove(objectKey: string, versionId?: string | null) {
    if (versionId) {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey, VersionId: versionId }));
    }
    // A timeout/crash can leave an unrecorded successful PUT, or SDK retries can create
    // several versions. Keys are UUIDs exclusive to one batch; reconcile every exact-key version.
    let keyMarker: string | undefined;
    let versionMarker: string | undefined;
    do {
      const page = await this.client.send(new ListObjectVersionsCommand({ Bucket: this.bucket, Prefix: objectKey, KeyMarker: keyMarker, VersionIdMarker: versionMarker }));
      for (const item of [...(page.Versions ?? []), ...(page.DeleteMarkers ?? [])]) {
        if (item.Key === objectKey && item.VersionId) await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey, VersionId: item.VersionId }));
      }
      keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
      versionMarker = page.IsTruncated ? page.NextVersionIdMarker : undefined;
    } while (keyMarker);
    // Unversioned objects are returned with VersionId="null" and deleted above.
    // Do not issue a plain DELETE here: that creates a new marker in versioned buckets.
  }
  async signedDownload(objectKey: string, filename: string, versionId?: string | null) {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: objectKey, VersionId: versionId ?? undefined,
      ResponseContentDisposition: `attachment; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}"`,
      ResponseCacheControl: 'private, no-store',
    }), { expiresIn: 60 });
  }
  async healthy() { await this.client.send(new ListObjectVersionsCommand({ Bucket: this.bucket, Prefix: 'registration/customer/', MaxKeys: 1 }), { abortSignal: AbortSignal.timeout(5000) }); }
}
