import { Injectable } from '@nestjs/common';
import { GarminConnector } from '../../domain/garmin/garmin-connector';
import { StartGarminLoginUseCase } from './start-garmin-login.use-case';

export type SubmitGarminMfaResult =
  { status: 'ok' } | { status: 'error'; message: string };

/** Completes a Garmin login that was paused waiting for an MFA code. */
@Injectable()
export class SubmitGarminMfaUseCase {
  constructor(
    private readonly garminConnector: GarminConnector,
    private readonly startGarminLogin: StartGarminLoginUseCase,
  ) {}

  async execute(
    userId: string,
    pendingId: string,
    code: string,
  ): Promise<SubmitGarminMfaResult> {
    const result = await this.garminConnector.submitMfaCode(pendingId, code);

    if (result.status === 'error') {
      return { status: 'error', message: result.message };
    }
    if (result.status === 'mfa_required') {
      return { status: 'error', message: 'Unexpected second MFA challenge' };
    }

    await this.startGarminLogin.persistValidatedTokens(
      userId,
      result.tokensJson,
    );
    return { status: 'ok' };
  }
}
