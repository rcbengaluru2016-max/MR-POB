import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { ConfigService } from '../config/config.service';
import { randomUUID } from 'node:crypto';

@Injectable()
export class NotificationQueue implements OnModuleDestroy {
  private readonly client: SQSClient;
  constructor(private readonly config: ConfigService) {
    this.client = new SQSClient({ region: config.get('AWS_REGION'), maxAttempts: 2 });
  }
  private sendTo(url: string, id: string, deduplicationId = id) {
    return this.client.send(new SendMessageCommand({ QueueUrl: url, MessageBody: JSON.stringify({ notificationId: id }),
      ...(url.endsWith('.fifo') ? { MessageGroupId: id, MessageDeduplicationId: deduplicationId } : {}) }), { abortSignal: AbortSignal.timeout(10_000) });
  }
  // Each intentional publication needs its own FIFO ID: using the event ID
  // would suppress safe provider retries for five minutes after acknowledgment.
  // SDK retries reuse this command/ID; the durable consumer deduplicates events.
  publish(id: string) { return this.sendTo(this.config.get('NOTIFICATION_SQS_URL'), id, randomUUID()); }
  deadLetter(id: string) { return this.sendTo(this.config.get('NOTIFICATION_SQS_DLQ_URL'), id); }
  async receive() {
    return (await this.client.send(new ReceiveMessageCommand({ QueueUrl: this.config.get('NOTIFICATION_SQS_URL'), MaxNumberOfMessages: 1, WaitTimeSeconds: 10, VisibilityTimeout: 90 }), { abortSignal: AbortSignal.timeout(20_000) })).Messages ?? [];
  }
  acknowledge(receipt: string) {
    return this.client.send(new DeleteMessageCommand({ QueueUrl: this.config.get('NOTIFICATION_SQS_URL'), ReceiptHandle: receipt }), { abortSignal: AbortSignal.timeout(10_000) });
  }
  onModuleDestroy() { this.client.destroy(); }
}
