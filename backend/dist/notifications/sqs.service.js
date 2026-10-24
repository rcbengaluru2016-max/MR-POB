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
exports.NotificationQueue = void 0;
const common_1 = require("@nestjs/common");
const client_sqs_1 = require("@aws-sdk/client-sqs");
const config_service_1 = require("../config/config.service");
const node_crypto_1 = require("node:crypto");
let NotificationQueue = class NotificationQueue {
    config;
    client;
    constructor(config) {
        this.config = config;
        this.client = new client_sqs_1.SQSClient({ region: config.get('AWS_REGION'), maxAttempts: 2 });
    }
    sendTo(url, id, deduplicationId = id) {
        return this.client.send(new client_sqs_1.SendMessageCommand({ QueueUrl: url, MessageBody: JSON.stringify({ notificationId: id }),
            ...(url.endsWith('.fifo') ? { MessageGroupId: id, MessageDeduplicationId: deduplicationId } : {}) }), { abortSignal: AbortSignal.timeout(10_000) });
    }
    // Each intentional publication needs its own FIFO ID: using the event ID
    // would suppress safe provider retries for five minutes after acknowledgment.
    // SDK retries reuse this command/ID; the durable consumer deduplicates events.
    publish(id) { return this.sendTo(this.config.get('NOTIFICATION_SQS_URL'), id, (0, node_crypto_1.randomUUID)()); }
    deadLetter(id) { return this.sendTo(this.config.get('NOTIFICATION_SQS_DLQ_URL'), id); }
    async receive() {
        return (await this.client.send(new client_sqs_1.ReceiveMessageCommand({ QueueUrl: this.config.get('NOTIFICATION_SQS_URL'), MaxNumberOfMessages: 1, WaitTimeSeconds: 10, VisibilityTimeout: 90 }), { abortSignal: AbortSignal.timeout(20_000) })).Messages ?? [];
    }
    acknowledge(receipt) {
        return this.client.send(new client_sqs_1.DeleteMessageCommand({ QueueUrl: this.config.get('NOTIFICATION_SQS_URL'), ReceiptHandle: receipt }), { abortSignal: AbortSignal.timeout(10_000) });
    }
    onModuleDestroy() { this.client.destroy(); }
};
exports.NotificationQueue = NotificationQueue;
exports.NotificationQueue = NotificationQueue = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_service_1.ConfigService])
], NotificationQueue);
//# sourceMappingURL=sqs.service.js.map