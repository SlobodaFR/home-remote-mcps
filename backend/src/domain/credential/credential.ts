export type CredentialStatus = 'pending_mfa' | 'ok' | 'failed';

export interface CredentialProps {
  id: string;
  userId: string;
  service: string;
  status: CredentialStatus;
  /** Encrypted session tokens (opaque JSON, service-specific). Absent while pending_mfa/failed. */
  encryptedTokens: string | null;
  lastError: string | null;
  lastTestedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A stored, validated connection to a third-party service (Garmin today,
 * others later) belonging to one user. Only ever holds session tokens
 * obtained after a successful login test - never the raw password.
 */
export class Credential {
  private constructor(private props: CredentialProps) {}

  static create(
    props: Omit<
      CredentialProps,
      'status' | 'lastError' | 'encryptedTokens' | 'lastTestedAt'
    >,
  ): Credential {
    return new Credential({
      ...props,
      status: 'pending_mfa',
      encryptedTokens: null,
      lastError: null,
      lastTestedAt: null,
    });
  }

  static restore(props: CredentialProps): Credential {
    return new Credential(props);
  }

  get id(): string {
    return this.props.id;
  }

  get userId(): string {
    return this.props.userId;
  }

  get service(): string {
    return this.props.service;
  }

  get status(): CredentialStatus {
    return this.props.status;
  }

  get encryptedTokens(): string | null {
    return this.props.encryptedTokens;
  }

  get lastError(): string | null {
    return this.props.lastError;
  }

  get lastTestedAt(): Date | null {
    return this.props.lastTestedAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  markValidated(encryptedTokens: string, now: Date): void {
    this.props = {
      ...this.props,
      status: 'ok',
      encryptedTokens,
      lastError: null,
      lastTestedAt: now,
      updatedAt: now,
    };
  }

  markFailed(reason: string, now: Date): void {
    this.props = {
      ...this.props,
      status: 'failed',
      lastError: reason,
      lastTestedAt: now,
      updatedAt: now,
    };
  }
}
