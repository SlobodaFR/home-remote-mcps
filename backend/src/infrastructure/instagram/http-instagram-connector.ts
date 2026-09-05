import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  InstagramConnector,
  InstagramHttpMethod,
  InstagramTestResult,
} from '../../domain/instagram/instagram-connector';

const DEFAULT_BASE_URL = 'https://graph.facebook.com';
const DEFAULT_API_VERSION = 'v21.0';

interface GraphErrorBody {
  error?: { message?: string };
}

interface GraphPage {
  id: string;
  instagram_business_account?: { id: string; username: string };
}

/** Direct REST client for Meta's Graph API (Instagram professional accounts). */
@Injectable()
export class HttpInstagramConnector extends InstagramConnector {
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    super();
    const base =
      this.config.get<string>('INSTAGRAM_GRAPH_API_BASE_URL') ??
      DEFAULT_BASE_URL;
    const version =
      this.config.get<string>('INSTAGRAM_GRAPH_API_VERSION') ??
      DEFAULT_API_VERSION;
    this.baseUrl = `${base.replace(/\/+$/, '')}/${version}/`;
  }

  async resolveAccount(accessToken: string): Promise<InstagramTestResult> {
    try {
      const data = await this.request<{ data: GraphPage[] }>(
        accessToken,
        'GET',
        'me/accounts',
        {
          queryParams: {
            fields: 'id,name,instagram_business_account{id,username}',
          },
        },
      );
      const page = data.data.find((p) => p.instagram_business_account);
      if (!page?.instagram_business_account) {
        return {
          status: 'error',
          message:
            'No Facebook Page with a linked Instagram professional account was found for this token. Connect a Page to an Instagram business/creator account first.',
        };
      }
      return {
        status: 'ok',
        pageId: page.id,
        igUserId: page.instagram_business_account.id,
        igUsername: page.instagram_business_account.username,
      };
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async request<T>(
    accessToken: string,
    httpMethod: InstagramHttpMethod,
    path: string,
    options?: {
      jsonBody?: Record<string, unknown>;
      queryParams?: Record<string, string>;
    },
  ): Promise<T> {
    const url = new URL(path.replace(/^\/+/, ''), this.baseUrl);
    url.searchParams.set('access_token', accessToken);
    if (options?.queryParams) {
      for (const [key, value] of Object.entries(options.queryParams)) {
        url.searchParams.set(key, value);
      }
    }

    const response = await fetch(url, {
      method: httpMethod,
      headers:
        httpMethod === 'POST'
          ? { 'Content-Type': 'application/json' }
          : undefined,
      body:
        httpMethod === 'POST' && options?.jsonBody
          ? JSON.stringify(options.jsonBody)
          : undefined,
    });

    const body = (await response.json().catch(() => ({}))) as GraphErrorBody &
      Record<string, unknown>;

    if (!response.ok || body.error) {
      throw new Error(
        body.error?.message ??
          `Instagram Graph API request failed: ${response.status.toString()}`,
      );
    }

    return body as T;
  }
}
