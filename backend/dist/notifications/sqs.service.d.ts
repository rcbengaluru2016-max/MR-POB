import { OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
export declare class NotificationQueue implements OnModuleDestroy {
    private readonly config;
    private readonly client;
    constructor(config: ConfigService);
    private sendTo;
    publish(id: string): Promise<import("@aws-sdk/client-sqs").SendMessageCommandOutput>;
    deadLetter(id: string): Promise<import("@aws-sdk/client-sqs").SendMessageCommandOutput>;
    receive(): Promise<import("@aws-sdk/client-sqs").Message[]>;
    acknowledge(receipt: string): Promise<import("@aws-sdk/client-sqs").DeleteMessageCommandOutput>;
    onModuleDestroy(): void;
}
