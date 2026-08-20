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
import { HomeAssistantDataGateway } from '../../application/mcp/home-assistant-data-gateway';
import { Public } from '../http/decorators/public.decorator';
import {
  ApiKeyGuard,
  McpAuthenticatedRequest,
} from '../http/guards/api-key.guard';
import { registerHomeAssistantDomainTools } from './home-assistant-domain-tools';
import { registerHomeAssistantTools } from './home-assistant-tools';

/**
 * One MCP server instance per request, scoped to the user resolved from the
 * API key in the URL by ApiKeyGuard - see GarminMcpController for the full
 * rationale (same pattern, different service).
 */
@Public()
@UseGuards(ApiKeyGuard)
@Controller('mcp/home-assistant')
export class HomeAssistantMcpController {
  constructor(
    private readonly homeAssistantDataGateway: HomeAssistantDataGateway,
  ) {}

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
      name: 'home-remote-mcps-home-assistant',
      version: '1.0.0',
    });
    registerHomeAssistantTools(
      server,
      this.homeAssistantDataGateway,
      req.mcpUserId,
    );
    registerHomeAssistantDomainTools(
      server,
      this.homeAssistantDataGateway,
      req.mcpUserId,
    );

    const transport = new NodeStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body as unknown);
  }
}
