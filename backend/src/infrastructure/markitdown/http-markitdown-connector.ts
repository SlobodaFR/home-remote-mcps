import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MarkitdownConnector,
  MarkitdownConvertResult,
  MarkitdownTestResult,
} from '../../domain/markitdown/markitdown-connector';

interface SidecarErrorBody {
  detail?: string;
}

/**
 * HTTP client for the markitdown-connector Python sidecar (FastAPI), which
 * owns the actual document-to-Markdown conversion via the `markitdown`
 * library (no maintained Node/TS equivalent covers the same format
 * surface). Reachable only on the internal docker network, guarded by a
 * shared secret header - same shape as HttpGarminConnector.
 */
@Injectable()
export class HttpMarkitdownConnector extends MarkitdownConnector {
  private readonly baseUrl: string;
  private readonly sharedSecret: string;

  constructor(private readonly config: ConfigService) {
    super();
    this.baseUrl = this.config.getOrThrow<string>('MARKITDOWN_CONNECTOR_URL');
    this.sharedSecret = this.config.getOrThrow<string>(
      'MARKITDOWN_CONNECTOR_SECRET',
    );
  }

  async testConnection(): Promise<MarkitdownTestResult> {
    try {
      const response = await fetch(new URL('/health', this.baseUrl));
      if (!response.ok) {
        return {
          status: 'error',
          message: `markitdown-connector health check failed: ${response.status.toString()}`,
        };
      }
      return { status: 'ok' };
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async convertUrl(url: string): Promise<MarkitdownConvertResult> {
    return this.post('/convert', { url });
  }

  async convertContent(
    base64Content: string,
    filename?: string,
  ): Promise<MarkitdownConvertResult> {
    return this.post('/convert', { base64Content, filename });
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(new URL(path, this.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': this.sharedSecret,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errorBody = (await response
        .json()
        .catch(() => ({}))) as SidecarErrorBody;
      throw new Error(
        errorBody.detail ??
          `markitdown-connector request failed: ${response.status.toString()}`,
      );
    }
    return (await response.json()) as T;
  }
}
