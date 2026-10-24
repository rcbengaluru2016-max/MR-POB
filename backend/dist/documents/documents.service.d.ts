import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ErpUser, RegistrationKind } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { S3StorageService } from './s3-storage.service';
export type ValidatedFile = {
    slot: string;
    originalName: string;
    buffer: Buffer;
    contentType: string;
    size: number;
    sha256: string;
    extension: string;
};
export type StagedDocument = Omit<ValidatedFile, 'buffer' | 'extension'> & {
    id: string;
    objectKey: string;
    versionId?: string;
};
export declare class DocumentsService implements OnModuleInit, OnModuleDestroy {
    private readonly prisma;
    private readonly storage;
    private readonly logger;
    private timer?;
    private cleaning;
    constructor(prisma: PrismaService, storage: S3StorageService);
    onModuleInit(): void;
    onModuleDestroy(): void;
    validateFiles(kind: RegistrationKind, files: Express.Multer.File[]): Promise<ValidatedFile[]>;
    stageUploads(kind: RegistrationKind, registrationId: string, files: ValidatedFile[]): Promise<{
        batchId: string;
        documents: StagedDocument[];
    }>;
    cleanupBatch(batchId: string): Promise<void>;
    reconcile(): Promise<void>;
    download(id: string, user: ErpUser): Promise<{
        url: string;
        expiresIn: number;
    }>;
}
