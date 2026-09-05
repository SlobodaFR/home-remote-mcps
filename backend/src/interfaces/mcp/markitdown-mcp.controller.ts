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
import { MarkitdownGateway } from '../../application/mcp/markitdown-gateway';
import { Public } from '../http/decorators/public.decorator';
import {
  ApiKeyGuard,
  McpAuthenticatedRequest,
} from '../http/guards/api-key.guard';
import { registerMarkitdownTools } from './markitdown-tools';

/**
 * One MCP server instance per request, scoped to the user resolved from the
 * API key in the URL by ApiKeyGuard - see GarminMcpController for the full
 * rationale (same pattern, different service). Tools themselves are
 * stateless (no per-user credential), but the route still requires an API
 * key so this MCP endpoint isn't reachable by anyone who knows the URL.
 */
@Public()
@UseGuards(ApiKeyGuard)
@Controller('mcp/markitdown')
export class MarkitdownMcpController {
  constructor(private readonly markitdownGateway: MarkitdownGateway) {}

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
      name: 'home-remote-mcps-markitdown',
      version: '1.0.0',
    });
    registerMarkitdownTools(server, this.markitdownGateway);

    const transport = new NodeStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body as unknown);
  }
}
