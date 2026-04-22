import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';

import { StorageService } from '../services/storage.service';

// Mock the presigner module at top level — non-configurable ESM export
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://mock-presigned-url'),
}));

const s3Mock = mockClient(S3Client);

const makeConfig = (overrides: Record<string, string> = {}) => ({
  AWS_S3_BUCKET: 'test-bucket',
  AWS_REGION: 'eu-central-1',
  AWS_ACCESS_KEY_ID: 'test',
  AWS_SECRET_ACCESS_KEY: 'test',
  AWS_S3_ENDPOINT: 'http://localhost:4566',
  AWS_S3_FORCE_PATH_STYLE: 'true',
  FILES_PRESIGN_EXPIRES_SEC: '900',
  CLOUDFRONT_BASE_URL: '',
  ...overrides,
});

async function buildService(cfg: Record<string, string> = {}): Promise<StorageService> {
  const config = makeConfig(cfg);
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      StorageService,
      {
        provide: ConfigService,
        useValue: {
          getOrThrow: (key: string) => {
            if (config[key] === undefined) throw new Error(`Missing config: ${key}`);
            return config[key];
          },
          get: (key: string, def = '') => config[key] ?? def,
        },
      },
    ],
  }).compile();
  return module.get(StorageService);
}

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(async () => {
    s3Mock.reset();
    service = await buildService();
  });

  describe('presignPutUrl', () => {
    it('returns a presigned URL string from mocked getSignedUrl', async () => {
      // jest.mock at top sets getSignedUrl → 'https://mock-presigned-url'
      const url = await service.presignPutUrl('products/1/images/test.jpg', 'image/jpeg', 1024);
      expect(url).toBe('https://mock-presigned-url');
    });
  });

  describe('objectExists', () => {
    it('returns true when HeadObject succeeds', async () => {
      s3Mock.on(HeadObjectCommand).resolves({});
      await expect(service.objectExists('some/key.jpg')).resolves.toBe(true);
    });

    it('returns false on 404', async () => {
      s3Mock
        .on(HeadObjectCommand)
        .rejects(Object.assign(new Error('Not Found'), { $metadata: { httpStatusCode: 404 } }));
      await expect(service.objectExists('missing/key.jpg')).resolves.toBe(false);
    });

    it('rethrows non-404 errors', async () => {
      s3Mock
        .on(HeadObjectCommand)
        .rejects(Object.assign(new Error('Server Error'), { $metadata: { httpStatusCode: 500 } }));
      await expect(service.objectExists('some/key.jpg')).rejects.toThrow('Server Error');
    });
  });

  describe('deleteObject', () => {
    it('calls DeleteObjectCommand with correct key', async () => {
      s3Mock.on(DeleteObjectCommand).resolves({});
      await service.deleteObject('some/key.jpg');
      expect(s3Mock.calls()).toHaveLength(1);
      expect(s3Mock.calls()[0].args[0].input).toMatchObject({ Key: 'some/key.jpg' });
    });
  });

  describe('getViewUrl', () => {
    it('returns LocalStack path-style URL when endpoint is configured', () => {
      expect(service.getViewUrl('products/1/images/abc.jpg')).toBe(
        'http://localhost:4566/test-bucket/products/1/images/abc.jpg',
      );
    });

    it('returns CloudFront URL when CLOUDFRONT_BASE_URL is set', async () => {
      const cfService = await buildService({
        CLOUDFRONT_BASE_URL: 'https://cdn.example.com',
        AWS_S3_ENDPOINT: '',
      });
      expect(cfService.getViewUrl('products/1/images/abc.jpg')).toBe(
        'https://cdn.example.com/products/1/images/abc.jpg',
      );
    });

    it('returns AWS S3 URL when no endpoint and no CloudFront', async () => {
      const awsService = await buildService({
        CLOUDFRONT_BASE_URL: '',
        AWS_S3_ENDPOINT: '',
      });
      expect(awsService.getViewUrl('products/1/images/abc.jpg')).toBe(
        'https://test-bucket.s3.eu-central-1.amazonaws.com/products/1/images/abc.jpg',
      );
    });
  });

  describe('getBucketName / getExpiresIn', () => {
    it('returns correct bucket name', () => {
      expect(service.getBucketName()).toBe('test-bucket');
    });

    it('returns correct expiresIn', () => {
      expect(service.getExpiresIn()).toBe(900);
    });
  });
});
