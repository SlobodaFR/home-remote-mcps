import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import { McpServer } from '@modelcontextprotocol/server';
import {
  Controller,
  InternalServerErrorException,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { InstagramDataGateway } from '../../application/mcp/instagram-data-gateway';
import { Public } from '../http/decorators/public.decorator';
import {
  ApiKeyGuard,
  McpAuthenticatedRequest,
} from '../http/guards/api-key.guard';
import { registerInstagramTools } from './instagram-tools';

/**
 * One MCP server instance per request, scoped to the user resolved from the
 * API key in the URL by ApiKeyGuard - see GarminMcpController for the full
 * rationale (same pattern, different service). Unlike every other
 * integration, the route carries a second path segment: a user can hold
 * several Instagram accounts, so `accountName` (chosen when connecting it in
 * the web UI) picks which one this MCP endpoint talks to.
 */
@Public()
@UseGuards(ApiKeyGuard)
@Controller('mcp/instagram')
export class InstagramMcpController {
  constructor(private readonly instagramDataGateway: InstagramDataGateway) {}

  @Post(':apiKey/:accountName')
  async handle(
    @Req() req: McpAuthenticatedRequest,
    @Res() res: Response,
    @Param('accountName') accountName: string,
  ): Promise<void> {
    if (!req.mcpUserId) {
      throw new InternalServerErrorException(
        'ApiKeyGuard did not resolve a user',
      );
    }

    const server = new McpServer({
      name: 'home-remote-mcps-instagram',
      version: '1.0.0',
    });
    registerInstagramTools(
      server,
      this.instagramDataGateway,
      req.mcpUserId,
      accountName,
    );

    const transport = new NodeStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body as unknown);
  }
}
