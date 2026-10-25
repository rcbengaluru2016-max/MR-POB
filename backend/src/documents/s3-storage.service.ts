import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectVersionsCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ConfigService } from '../config/config.service';

@Injectable()
export class S3StorageService {
  private readonly logger = new Logger(S3StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  constructor(config: ConfigService) {
    this.bucket = config.get('S3_BUCKET');
    this.client = new S3Client({ region: config.get('S3_REGION'), maxAttempts: 3,
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
  async signedDownload(objectKey: string, filename: string, versionId?: string | null, preview?: { contentType: string }) {
    try {
      return await getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: objectKey, VersionId: versionId ?? undefined,
        ResponseContentDisposition: `${preview ? 'inline' : 'attachment'}; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}"`,
        ...(preview ? { ResponseContentType: preview.contentType } : {}),
        ResponseCacheControl: 'private, no-store',
      }), { expiresIn: 60 });
    } catch (error) {
      // Keep SDK errors, credentials and signed URLs out of HTTP responses and logs.
      // The provider reloads renewed local login credentials on a subsequent request.
      if (error instanceof Error && ['CredentialsProviderError', 'TokenProviderError'].includes(error.name)) {
        this.logger.error(process.env.NODE_ENV === 'production'
          ? 'AWS credentials unavailable for document signing; check the task role credential provider.'
          : 'AWS credentials unavailable for document signing. Renew the configured profile with aws login --profile <AWS_PROFILE>, then retry.');
        throw Object.assign(new ServiceUnavailableException('Document storage is temporarily unavailable'), { code: 'AWS_CREDENTIALS_UNAVAILABLE' });
      }
      throw error;
    }
  }
  async healthy() { await this.client.send(new ListObjectVersionsCommand({ Bucket: this.bucket, Prefix: 'registration/customer/', MaxKeys: 1 }), { abortSignal: AbortSignal.timeout(5000) }); }
}
