import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { ResolveUserFromApiKeyUseCase } from '../../../application/mcp/resolve-user-from-api-key.use-case';

export interface McpAuthenticatedRequest extends Request {
  mcpUserId?: string;
}

/**
 * Guards /mcp/:service/:apiKey. The key travels in the URL path rather than
 * an Authorization header: Claude's remote-connector UI (mobile/desktop)
 * only asks for a URL, with no way to attach a custom header, so a bare
 * bearer-token endpoint would be unreachable from it. If Claude later
 * requires a real OAuth handshake for custom connectors, only this guard
 * and the controller route need to change - GarminDataGateway and the tool
 * handlers stay untouched.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly resolveUserFromApiKey: ResolveUserFromApiKeyUseCase,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<McpAuthenticatedRequest>();
    const rawKey = request.params.apiKey;
    if (!rawKey || typeof rawKey !== 'string') {
      throw new UnauthorizedException();
    }

    const resolved = await this.resolveUserFromApiKey.execute(rawKey);
    if (!resolved) {
      throw new UnauthorizedException();
    }

    request.mcpUserId = resolved.userId;
    return true;
  }
}
