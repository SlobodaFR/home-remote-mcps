import { Injectable } from '@nestjs/common';
import {
  HomeAssistantConnector,
  HomeAssistantCredentials,
  HomeAssistantHttpMethod,
  HomeAssistantTestResult,
} from '../../domain/home-assistant/home-assistant-connector';

interface HaErrorBody {
  message?: string;
}

/** Direct REST client for a user's Home Assistant instance (HAOS or otherwise). */
@Injectable()
export class HttpHomeAssistantConnector extends HomeAssistantConnector {
  async testConnection(
    credentials: HomeAssistantCredentials,
  ): Promise<HomeAssistantTestResult> {
    try {
      await this.request(credentials, 'GET', '/api/');
      return { status: 'ok' };
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async request<T>(
    credentials: HomeAssistantCredentials,
    httpMethod: HomeAssistantHttpMethod,
    path: string,
    options?: { jsonBody?: unknown; queryParams?: Record<string, string> },
  ): Promise<T> {
    const url = new URL(
      path.startsWith('/') ? path : `/${path}`,
      credentials.baseUrl,
    );
    if (options?.queryParams) {
      for (const [key, value] of Object.entries(options.queryParams)) {
        url.searchParams.set(key, value);
      }
    }

    const response = await fetch(url, {
      method: httpMethod,
      headers: {
        Authorization: `Bearer ${credentials.token}`,
        'Content-Type': 'application/json',
      },
      body:
        options?.jsonBody === undefined
          ? undefined
          : JSON.stringify(options.jsonBody),
    });

    if (!response.ok) {
      const errorBody = (await response
        .json()
        .catch(() => ({}))) as HaErrorBody;
      throw new Error(
        errorBody.message ??
          `Home Assistant request failed: ${response.status.toString()}`,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }
}
