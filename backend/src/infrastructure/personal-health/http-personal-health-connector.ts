import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PersonalHealthConnector,
  PersonalHealthCredentials,
  PersonalHealthTestResult,
} from '../../domain/personal-health/personal-health-connector';

const DEFAULT_BASE_URL = 'https://health.sloboda.fr';

/** Direct REST client for the health.sloboda.fr companion service. */
@Injectable()
export class HttpPersonalHealthConnector extends PersonalHealthConnector {
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    super();
    this.baseUrl =
      this.config.get<string>('PERSONAL_HEALTH_API_URL') ?? DEFAULT_BASE_URL;
  }

  async testConnection(
    credentials: PersonalHealthCredentials,
  ): Promise<PersonalHealthTestResult> {
    try {
      await this.request(credentials, '/metrics', { limit: '1' });
      return { status: 'ok' };
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async request<T>(
    credentials: PersonalHealthCredentials,
    path: string,
    queryParams?: Record<string, string | undefined>,
  ): Promise<T> {
    const url = new URL(
      `/api/health/${encodeURIComponent(credentials.apiKey)}${path.startsWith('/') ? path : `/${path}`}`,
      this.baseUrl,
    );
    if (queryParams) {
      for (const [key, value] of Object.entries(queryParams)) {
        if (value !== undefined) url.searchParams.set(key, value);
      }
    }

    const response = await fetch(url, { method: 'GET' });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Unknown or revoked personal-health API key.');
      }
      throw new Error(
        `Personal health request failed: ${response.status.toString()}`,
      );
    }
    return (await response.json()) as T;
  }
}
