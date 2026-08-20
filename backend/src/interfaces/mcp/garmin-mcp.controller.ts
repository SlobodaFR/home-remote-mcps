import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import { McpServer } from '@modelcontextprotocol/server';
import {
  Controller,
  InternalServerErrorException,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { GarminDataGateway } from '../../application/mcp/garmin-data-gateway';
import { Public } from '../http/decorators/public.decorator';
import {
  ApiKeyGuard,
  McpAuthenticatedRequest,
} from '../http/guards/api-key.guard';
import { registerGarminTools } from './garmin-tools';

/**
 * One MCP server instance per request (stateless Streamable HTTP - no
 * session state to manage), scoped to the user resolved from the API key
 * in the URL by ApiKeyGuard. @Public() bypasses the home-auth session
 * guard (APP_GUARD JwtAuthGuard): this route has its own auth mechanism,
 * since MCP clients authenticate with a per-user API key, not a browser
 * session cookie.
 */
@Public()
@UseGuards(ApiKeyGuard)
@Controller('mcp/garmin')
export class GarminMcpController {
  constructor(private readonly garminDataGateway: GarminDataGateway) {}

  @Post(':apiKey')
  async handle(
    @Req() req: McpAuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    if (!req.mcpUserId) {
      throw new InternalServerErrorException(
        'ApiKeyGuard did not resolve a user',
      );
    }

    const server = new McpServer({
      name: 'home-remote-mcps-garmin',
      version: '1.0.0',
    });
    registerGarminTools(server, this.garminDataGateway, req.mcpUserId);

    const transport = new NodeStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body as unknown);
  }
}
