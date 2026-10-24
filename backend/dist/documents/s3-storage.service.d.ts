import { ConfigService } from '../config/config.service';
export declare class S3StorageService {
    private readonly client;
    private readonly bucket;
    constructor(config: ConfigService);
    put(objectKey: string, buffer: Buffer, contentType: string, sha256: string): Promise<{
        versionId: string | undefined;
    }>;
    remove(objectKey: string, versionId?: string | null): Promise<void>;
    signedDownload(objectKey: string, filename: string, versionId?: string | null): Promise<string>;
    healthy(): Promise<void>;
}
