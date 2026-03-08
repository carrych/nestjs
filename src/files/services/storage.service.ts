import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly region: string;
  private readonly cloudfrontBaseUrl: string | undefined;
  private readonly s3Endpoint: string | undefined;
  private readonly expiresIn: number;

  constructor(private readonly config: ConfigService) {
    this.bucket = config.getOrThrow<string>('AWS_S3_BUCKET');
    this.region = config.getOrThrow<string>('AWS_REGION');
    this.cloudfrontBaseUrl = config.get<string>('CLOUDFRONT_BASE_URL') || undefined;
    this.s3Endpoint = config.get<string>('AWS_S3_ENDPOINT') || undefined;
    this.expiresIn = Number(config.get<string>('FILES_PRESIGN_EXPIRES_SEC') ?? 900);

    this.client = new S3Client({
      region: this.region,
      endpoint: this.s3Endpoint,
      forcePathStyle: config.get<string>('AWS_S3_FORCE_PATH_STYLE') === 'true',
      // Disable automatic checksum injection so presigned PUT URLs work
      // without clients needing to send x-amz-checksum-* headers
      requestChecksumCalculation: 'WHEN_REQUIRED',
      credentials: {
        accessKeyId: config.getOrThrow<string>('AWS_ACCESS_KEY_ID'),
        secretAccessKey: config.getOrThrow<string>('AWS_SECRET_ACCESS_KEY'),
      },
    });
  }

  async presignPutUrl(key: string, contentType: string, size: number): Promise<string> {
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: size,
    });
    return getSignedUrl(this.client, cmd, { expiresIn: this.expiresIn });
  }

  async objectExists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (err: unknown) {
      const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata
        ?.httpStatusCode;
      if (status === 404) return false;
      throw err;
    }
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  getViewUrl(key: string): string {
    if (this.cloudfrontBaseUrl) return `${this.cloudfrontBaseUrl}/${key}`;
    if (this.s3Endpoint) return `${this.s3Endpoint}/${this.bucket}/${key}`;
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }

  getBucketName(): string {
    return this.bucket;
  }

  getExpiresIn(): number {
    return this.expiresIn;
  }
}
