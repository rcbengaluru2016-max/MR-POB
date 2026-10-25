import { DeleteMessageCommand, ReceiveMessageCommand, SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { ConfigService } from '../src/config/config.service';
import { NotificationQueue } from '../src/notifications/sqs.service';

describe('SQS notification transport contract', () => {
  const eventId = 'bb3081b9-a140-409c-8bbf-94a4fbe3aacc';
  afterEach(() => jest.restoreAllMocks());
  function queue(fifo = false) {
    const env: Record<string, string> = { AWS_REGION: 'ap-southeast-2', NOTIFICATION_SQS_URL: `https://sqs.ap-southeast-2.amazonaws.com/123456789012/events${fifo ? '.fifo' : ''}`, NOTIFICATION_SQS_DLQ_URL: `https://sqs.ap-southeast-2.amazonaws.com/123456789012/failed${fifo ? '.fifo' : ''}` };
    return new NotificationQueue({ get: (key: string) => env[key] } as ConfigService);
  }
  it.each([false, true])('publishes only a durable ID, with FIFO deduplication when applicable (%s)', async fifo => {
    const send = jest.spyOn(SQSClient.prototype, 'send').mockResolvedValue({} as never);
    const transport = queue(fifo);
    try {
      await transport.publish(eventId); await transport.deadLetter(eventId);
      for (const [command] of send.mock.calls) {
        expect(command).toBeInstanceOf(SendMessageCommand);
        expect((command as SendMessageCommand).input).toMatchObject({ MessageBody: JSON.stringify({ notificationId: eventId }) });
        if (fifo) expect((command as SendMessageCommand).input).toMatchObject({ MessageGroupId: eventId, MessageDeduplicationId: expect.any(String) });
        else expect((command as SendMessageCommand).input.MessageDeduplicationId).toBeUndefined();
      }
    } finally { transport.onModuleDestroy(); }
  });
  it('does not suppress intentional retries within the FIFO five-minute deduplication window', async () => {
    const send = jest.spyOn(SQSClient.prototype, 'send').mockResolvedValue({} as never);
    const transport = queue(true);
    try {
      await transport.publish(eventId); await transport.publish(eventId);
      const first = (send.mock.calls[0][0] as SendMessageCommand).input;
      const second = (send.mock.calls[1][0] as SendMessageCommand).input;
      expect(first.MessageBody).toBe(second.MessageBody);
      expect(first.MessageDeduplicationId).not.toBe(second.MessageDeduplicationId);
    } finally { transport.onModuleDestroy(); }
  });
  it('uses bounded polling, a visibility timeout longer than processing, and explicit acknowledgments', async () => {
    const send = jest.spyOn(SQSClient.prototype, 'send').mockResolvedValue({ Messages: [{ Body: '{}', ReceiptHandle: 'receipt' }] } as never);
    const transport = queue();
    try {
      expect(await transport.receive()).toHaveLength(1);
      expect(send.mock.calls[0][0]).toBeInstanceOf(ReceiveMessageCommand);
      expect((send.mock.calls[0][0] as ReceiveMessageCommand).input).toMatchObject({ MaxNumberOfMessages: 1, WaitTimeSeconds: 10, VisibilityTimeout: 90 });
      await transport.acknowledge('receipt');
      expect(send.mock.calls[1][0]).toBeInstanceOf(DeleteMessageCommand);
      expect((send.mock.calls[1][0] as DeleteMessageCommand).input.ReceiptHandle).toBe('receipt');
    } finally { transport.onModuleDestroy(); }
  });
});
