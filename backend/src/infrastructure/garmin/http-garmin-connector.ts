import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GarminConnector,
  GarminDataResult,
  GarminLoginResult,
} from '../../domain/garmin/garmin-connector';

interface SidecarErrorBody {
  detail?: string;
}

/**
 * HTTP client for the garmin-connector Python sidecar (FastAPI), which owns
 * the actual Garmin Connect login/session logic via the `garminconnect` lib
 * (handles MFA + Garmin's current auth flow - no equivalent Node lib is
 * actively maintained for this). Reachable only on the internal docker
 * network, guarded by a shared secret header.
 */
@Injectable()
export class HttpGarminConnector extends GarminConnector {
  private readonly baseUrl: string;
  private readonly sharedSecret: string;

  constructor(private readonly config: ConfigService) {
    super();
    this.baseUrl = this.config.getOrThrow<string>('GARMIN_CONNECTOR_URL');
    this.sharedSecret = this.config.getOrThrow<string>(
      'GARMIN_CONNECTOR_SECRET',
    );
  }

  async startLogin(
    email: string,
    password: string,
  ): Promise<GarminLoginResult> {
    return this.post<GarminLoginResult>('/login', { email, password });
  }

  async submitMfaCode(
    pendingId: string,
    code: string,
  ): Promise<GarminLoginResult> {
    return this.post<GarminLoginResult>(
      `/login/${encodeURIComponent(pendingId)}/mfa`,
      { code },
    );
  }

  async checkTokens(
    tokensJson: string,
  ): Promise<GarminDataResult<{ valid: boolean }>> {
    return this.postWithTokens('/session/check', tokensJson, {});
  }

  async getDailySteps(
    tokensJson: string,
    date: string,
  ): Promise<GarminDataResult<Record<string, unknown>>> {
    return this.postWithTokens('/data/steps', tokensJson, { date });
  }

  async getSleep(
    tokensJson: string,
    date: string,
  ): Promise<GarminDataResult<Record<string, unknown>>> {
    return this.postWithTokens('/data/sleep', tokensJson, { date });
  }

  async getHeartRate(
    tokensJson: string,
    date: string,
  ): Promise<GarminDataResult<Record<string, unknown>>> {
    return this.postWithTokens('/data/heart-rate', tokensJson, { date });
  }

  async getBodyBattery(
    tokensJson: string,
    date: string,
  ): Promise<GarminDataResult<Record<string, unknown>>> {
    return this.postWithTokens('/data/body-battery', tokensJson, { date });
  }

  async getStress(
    tokensJson: string,
    date: string,
  ): Promise<GarminDataResult<Record<string, unknown>>> {
    return this.postWithTokens('/data/stress', tokensJson, { date });
  }

  async getActivities(
    tokensJson: string,
    limit: number,
  ): Promise<GarminDataResult<Record<string, unknown>[]>> {
    return this.postWithTokens('/data/activities', tokensJson, { limit });
  }

  private async postWithTokens<T>(
    path: string,
    tokensJson: string,
    extra: Record<string, unknown>,
  ): Promise<T> {
    return this.post<T>(path, {
      tokensJson: JSON.parse(tokensJson) as unknown,
      ...extra,
    });
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
          `garmin-connector request failed: ${response.status.toString()}`,
      );
    }
    return (await response.json()) as T;
  }
}
