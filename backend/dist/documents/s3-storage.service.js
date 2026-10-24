"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.S3StorageService = void 0;
const common_1 = require("@nestjs/common");
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const config_service_1 = require("../config/config.service");
let S3StorageService = class S3StorageService {
    client;
    bucket;
    constructor(config) {
        this.bucket = config.get('S3_BUCKET');
        this.client = new client_s3_1.S3Client({ region: config.get('AWS_REGION'), maxAttempts: 3,
            ...(config.optional('S3_ENDPOINT') ? { endpoint: config.optional('S3_ENDPOINT'), forcePathStyle: true } : {}),
            requestHandler: { connectionTimeout: 5000, requestTimeout: 120000 },
        });
    }
    async put(objectKey, buffer, contentType, sha256) {
        const response = await this.client.send(new client_s3_1.PutObjectCommand({ Bucket: this.bucket, Key: objectKey, Body: buffer,
            ContentType: contentType, ContentLength: buffer.length, ServerSideEncryption: 'AES256',
            ChecksumSHA256: Buffer.from(sha256, 'hex').toString('base64'), Metadata: { sha256 },
        }));
        return { versionId: response.VersionId };
    }
    async remove(objectKey, versionId) {
        if (versionId) {
            await this.client.send(new client_s3_1.DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey, VersionId: versionId }));
        }
        // A timeout/crash can leave an unrecorded successful PUT, or SDK retries can create
        // several versions. Keys are UUIDs exclusive to one batch; reconcile every exact-key version.
        let keyMarker;
        let versionMarker;
        do {
            const page = await this.client.send(new client_s3_1.ListObjectVersionsCommand({ Bucket: this.bucket, Prefix: objectKey, KeyMarker: keyMarker, VersionIdMarker: versionMarker }));
            for (const item of [...(page.Versions ?? []), ...(page.DeleteMarkers ?? [])]) {
                if (item.Key === objectKey && item.VersionId)
                    await this.client.send(new client_s3_1.DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey, VersionId: item.VersionId }));
            }
            keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
            versionMarker = page.IsTruncated ? page.NextVersionIdMarker : undefined;
        } while (keyMarker);
        // Unversioned objects are returned with VersionId="null" and deleted above.
        // Do not issue a plain DELETE here: that creates a new marker in versioned buckets.
    }
    async signedDownload(objectKey, filename, versionId) {
        return (0, s3_request_presigner_1.getSignedUrl)(this.client, new client_s3_1.GetObjectCommand({ Bucket: this.bucket, Key: objectKey, VersionId: versionId ?? undefined,
            ResponseContentDisposition: `attachment; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}"`,
            ResponseCacheControl: 'private, no-store',
        }), { expiresIn: 60 });
    }
    async healthy() { await this.client.send(new client_s3_1.ListObjectVersionsCommand({ Bucket: this.bucket, Prefix: 'registration/customer/', MaxKeys: 1 }), { abortSignal: AbortSignal.timeout(5000) }); }
};
exports.S3StorageService = S3StorageService;
exports.S3StorageService = S3StorageService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_service_1.ConfigService])
], S3StorageService);
//# sourceMappingURL=s3-storage.service.js.map