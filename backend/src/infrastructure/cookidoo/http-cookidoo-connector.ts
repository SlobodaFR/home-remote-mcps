import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CookidooConnector,
  CookidooDataResult,
  CookidooLocalization,
  CookidooLoginResult,
} from '../../domain/cookidoo/cookidoo-connector';

interface SidecarErrorBody {
  detail?: string;
}

/**
 * HTTP client for the cookidoo-connector Python sidecar (FastAPI), which
 * owns the actual Cookidoo login/session-cookie logic via the `cookidoo-api`
 * lib (username/password OAuth2 login, cookie jar persistence - no
 * equivalent Node lib is actively maintained for this). Reachable only on
 * the internal docker network, guarded by a shared secret header.
 */
@Injectable()
export class HttpCookidooConnector extends CookidooConnector {
  private readonly baseUrl: string;
  private readonly sharedSecret: string;

  constructor(private readonly config: ConfigService) {
    super();
    this.baseUrl = this.config.getOrThrow<string>('COOKIDOO_CONNECTOR_URL');
    this.sharedSecret = this.config.getOrThrow<string>(
      'COOKIDOO_CONNECTOR_SECRET',
    );
  }

  async login(
    email: string,
    password: string,
    countryCode: string,
    language: string,
  ): Promise<CookidooLoginResult> {
    return this.post<CookidooLoginResult>('/login', {
      email,
      password,
      countryCode,
      language,
    });
  }

  async listLocalizations(
    country?: string,
    language?: string,
  ): Promise<CookidooLocalization[]> {
    const params = new URLSearchParams();
    if (country) params.set('country', country);
    if (language) params.set('language', language);
    const query = params.size > 0 ? `?${params.toString()}` : '';
    return this.get<CookidooLocalization[]>(`/localizations${query}`);
  }

  async checkSession(
    cookiesJson: string,
    localization: CookidooLocalization,
  ): Promise<CookidooDataResult<{ valid: boolean }>> {
    return this.post('/session/check', {
      cookiesJson: JSON.parse(cookiesJson) as unknown,
      localization,
    });
  }

  async call<T>(
    cookiesJson: string,
    localization: CookidooLocalization,
    method: string,
    params: Record<string, unknown>,
  ): Promise<CookidooDataResult<T>> {
    return this.post<CookidooDataResult<T>>('/call', {
      cookiesJson: JSON.parse(cookiesJson) as unknown,
      localization,
      method,
      params,
    });
  }

  private async get<T>(path: string): Promise<T> {
    const response = await fetch(new URL(path, this.baseUrl), {
      headers: { 'X-Internal-Secret': this.sharedSecret },
    });
    return this.parseResponse<T>(response);
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
    return this.parseResponse<T>(response);
  }

  private async parseResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const errorBody = (await response
        .json()
        .catch(() => ({}))) as SidecarErrorBody;
      throw new Error(
        errorBody.detail ??
          `cookidoo-connector request failed: ${response.status.toString()}`,
      );
    }
    return (await response.json()) as T;
  }
}
