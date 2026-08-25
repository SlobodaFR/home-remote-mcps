import { gunzipSync } from 'zlib';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';
import {
  LogObjectSummary,
  LogsConnector,
  LogsCredentials,
  LogsTestResult,
} from '../../domain/logs/log-connector';

const GZIP_MAGIC = [0x1f, 0x8b];

/**
 * Vector's aws_s3 sink gzips every object and sets Content-Encoding: gzip on
 * upload, but that's metadata - some paths between Vector and this backend
 * (a compressing reverse proxy in front of MinIO, for instance) can honor it
 * and hand back already-decompressed bytes. Detect via the gzip magic bytes
 * instead of assuming, so that case degrades to reading the plaintext
 * instead of throwing, and a genuinely corrupt object fails with an
 * inspectable message instead of a bare zlib error.
 */
function decompressLogObject(buffer: Buffer, key: string): string {
  if (buffer.length === 0) {
    throw new Error(`Log object is empty: ${key}`);
  }
  if (buffer[0] !== GZIP_MAGIC[0] || buffer[1] !== GZIP_MAGIC[1]) {
    return buffer.toString('utf-8');
  }
  try {
    return gunzipSync(buffer).toString('utf-8');
  } catch (error) {
    const head = buffer.subarray(0, 16).toString('hex');
    throw new Error(
      `Failed to gunzip ${key} (${buffer.length.toString()} bytes, starts with ${head}): ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/** MinIO's JS client wants host/port/useSSL split out, not a single URL. */
function clientOptionsFromEndpoint(
  endpoint: string,
  accessKey: string,
  secretKey: string,
  region: string | undefined,
): ConstructorParameters<typeof Client>[0] {
  const url = new URL(endpoint);
  return {
    endPoint: url.hostname,
    port: url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80,
    useSSL: url.protocol === 'https:',
    accessKey,
    secretKey,
    region,
  };
}

/** Direct client for the shared home-lab MinIO bucket (same one Litestream replicates this backend's DB into). */
@Injectable()
export class MinioLogsConnector extends LogsConnector {
  private readonly client: Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    super();
    this.client = new Client(
      clientOptionsFromEndpoint(
        config.getOrThrow<string>('MINIO_ENDPOINT'),
        config.getOrThrow<string>('MINIO_ACCESS_KEY_ID'),
        config.getOrThrow<string>('MINIO_SECRET_ACCESS_KEY'),
        config.get<string>('MINIO_REGION'),
      ),
    );
    this.bucket = config.getOrThrow<string>('MINIO_BUCKET');
  }

  async testConnection(credentials: LogsCredentials): Promise<LogsTestResult> {
    try {
      await this.listPrefixes(credentials, credentials.basePath);
      return { status: 'ok' };
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  listPrefixes(
    _credentials: LogsCredentials,
    prefix: string,
  ): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const prefixes: string[] = [];
      const stream = this.client.listObjectsV2(this.bucket, prefix, false);
      stream.on('data', (obj) => {
        if ('prefix' in obj && obj.prefix) prefixes.push(obj.prefix);
      });
      stream.on('end', () => {
        resolve(prefixes);
      });
      stream.on('error', reject);
    });
  }

  listObjects(
    _credentials: LogsCredentials,
    prefix: string,
  ): Promise<LogObjectSummary[]> {
    return new Promise((resolve, reject) => {
      const objects: LogObjectSummary[] = [];
      const stream = this.client.listObjectsV2(this.bucket, prefix, true);
      stream.on('data', (obj) => {
        if ('name' in obj && obj.name) {
          objects.push({
            key: obj.name,
            size: obj.size,
            lastModified: obj.lastModified.toISOString(),
          });
        }
      });
      stream.on('end', () => {
        resolve(objects);
      });
      stream.on('error', reject);
    });
  }

  async readObjectLines(
    _credentials: LogsCredentials,
    key: string,
  ): Promise<unknown[]> {
    const stream = await this.client.getObject(this.bucket, key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      chunks.push(chunk);
    }
    return decompressLogObject(Buffer.concat(chunks), key)
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as unknown);
  }
}
