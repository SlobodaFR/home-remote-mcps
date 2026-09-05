import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OpenAiConnector,
  OpenAiCredentials,
  OpenAiHttpMethod,
  OpenAiTestResult,
} from '../../domain/openai/openai-connector';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

interface OpenAiErrorBody {
  error?: { message?: string };
}

/** Direct REST client for the OpenAI API. */
@Injectable()
export class HttpOpenAiConnector extends OpenAiConnector {
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    super();
    const base =
      this.config.get<string>('OPENAI_API_BASE_URL') ?? DEFAULT_BASE_URL;
    this.baseUrl = `${base.replace(/\/+$/, '')}/`;
  }

  async testConnection(
    credentials: OpenAiCredentials,
  ): Promise<OpenAiTestResult> {
    try {
      await this.request(credentials, 'GET', 'models');
      return { status: 'ok' };
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async request<T>(
    credentials: OpenAiCredentials,
    httpMethod: OpenAiHttpMethod,
    path: string,
    options?: {
      jsonBody?: Record<string, unknown>;
      queryParams?: Record<string, string>;
    },
  ): Promise<T> {
    const url = new URL(path.replace(/^\/+/, ''), this.baseUrl);
    if (options?.queryParams) {
      for (const [key, value] of Object.entries(options.queryParams)) {
        url.searchParams.set(key, value);
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${credentials.apiKey}`,
    };
    if (credentials.organization) {
      headers['OpenAI-Organization'] = credentials.organization;
    }
    if (options?.jsonBody) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      method: httpMethod,
      headers,
      body: options?.jsonBody ? JSON.stringify(options.jsonBody) : undefined,
    });

    const body = (await response.json().catch(() => ({}))) as OpenAiErrorBody &
      Record<string, unknown>;

    if (!response.ok) {
      throw new Error(
        body.error?.message ??
          `OpenAI request failed: ${response.status.toString()}`,
      );
    }

    return body as T;
  }
}
