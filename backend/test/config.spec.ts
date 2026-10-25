import { ConfigService } from '../src/config/config.service';

describe('Registration bucket configuration', () => {
  const originalEnv = process.env;
  beforeEach(() => {
    process.env = {
      DATABASE_URL: 'postgresql://localhost/zenex_test',
      IDEMPOTENCY_SECRET: 'test-only-secret-with-at-least-32-characters',
      COGNITO_USER_POOL_ID: 'ap-southeast-2_testpool',
      COGNITO_CLIENT_ID: 'testclient',
    };
  });
  afterEach(() => { process.env = originalEnv; });

  it('defaults S3 to the new Mumbai bucket while retaining the existing service region', () => {
    const config = new ConfigService();
    expect(() => config.validate()).not.toThrow();
    expect(config.get('S3_BUCKET')).toBe('zenex-international-mrpob-files');
    expect(config.get('S3_REGION')).toBe('ap-south-1');
    expect(config.get('AWS_REGION')).toBe('ap-southeast-2');
  });

  it('allows other AWS services to move independently of S3', () => {
    process.env.AWS_REGION = 'ap-south-1';
    expect(() => new ConfigService().validate()).not.toThrow();
  });

  it.each([
    ['S3_BUCKET', 'zenex-international-mrpob'],
    ['S3_REGION', 'ap-southeast-2'],
  ])('rejects stale %s configuration', (key, value) => {
    process.env[key] = value;
    expect(() => new ConfigService().validate()).toThrow('Use the Mumbai registration bucket');
  });

  it('continues to reject a custom S3 endpoint in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.S3_ENDPOINT = 'http://localhost:4566';
    expect(() => new ConfigService().validate()).toThrow('Custom S3 endpoints are development-only');
  });
});
