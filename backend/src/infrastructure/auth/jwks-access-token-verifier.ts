import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createRemoteJWKSet,
  jwtVerify,
  JWTPayload,
  JWTVerifyOptions,
} from 'jose';
import { AccessTokenPayload } from '../../domain/auth/access-token-payload';
import { AccessTokenVerifier } from '../../domain/auth/access-token-verifier';
import { FeatureFlags } from '../../domain/shared/feature-flags';

/** home-features flag: enforce audience, issuer and algorithm (contract PC3). Code default: off. */
export const VERIFY_TOKEN_CLAIMS_FLAG = 'auth-verify-token-claims';

interface AuthServiceJwtPayload extends JWTPayload {
  email?: string;
  name?: string;
}

/**
 * Verifies access tokens issued by home-auth against its JWKS. With the `auth-verify-token-claims`
 * flag on, the token must also be RS256, issued by home-auth (`iss`) for this client (`aud`).
 */
@Injectable()
export class JwksAccessTokenVerifier extends AccessTokenVerifier {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly strictOptions: JWTVerifyOptions;

  constructor(
    private readonly config: ConfigService,
    private readonly flags: FeatureFlags,
  ) {
    super();
    const authServiceUrl = this.config.getOrThrow<string>('AUTH_SERVICE_URL');
    this.jwks = createRemoteJWKSet(
      new URL('/.well-known/jwks.json', authServiceUrl),
    );
    this.strictOptions = {
      audience: this.config.getOrThrow<string>('AUTH_CLIENT_ID'),
      issuer: new URL(authServiceUrl).origin,
      algorithms: ['RS256'],
    };
  }

  async verify(token: string): Promise<AccessTokenPayload | null> {
    try {
      const { payload } = await jwtVerify<AuthServiceJwtPayload>(
        token,
        this.jwks,
        (await this.strict()) ? this.strictOptions : undefined,
      );
      if (!payload.sub || !payload.email || !payload.name || !payload.iat) {
        return null;
      }
      return {
        sub: payload.sub,
        email: payload.email,
        name: payload.name,
        issuedAt: new Date(payload.iat * 1000),
      };
    } catch {
      return null;
    }
  }

  /** Never blocks nor fails the request: any problem reading the flag means the code default. */
  private async strict(): Promise<boolean> {
    try {
      return await this.flags.isEnabled(VERIFY_TOKEN_CLAIMS_FLAG, false);
    } catch {
      return false;
    }
  }
}
