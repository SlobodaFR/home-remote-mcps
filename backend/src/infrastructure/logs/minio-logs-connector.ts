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
    return gunzipSync(Buffer.concat(chunks))
      .toString('utf-8')
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as unknown);
  }
}
