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
import { PersonalHealthDataGateway } from '../../application/mcp/personal-health-data-gateway';
import { Public } from '../http/decorators/public.decorator';
import {
  ApiKeyGuard,
  McpAuthenticatedRequest,
} from '../http/guards/api-key.guard';
import { registerPersonalHealthTools } from './personal-health-tools';

/**
 * One MCP server instance per request, scoped to the user resolved from the
 * API key in the URL by ApiKeyGuard - see GarminMcpController for the full
 * rationale (same pattern, different service).
 */
@Public()
@UseGuards(ApiKeyGuard)
@Controller('mcp/personal-health')
export class PersonalHealthMcpController {
  constructor(
    private readonly personalHealthDataGateway: PersonalHealthDataGateway,
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
      name: 'home-remote-mcps-personal-health',
      version: '1.0.0',
    });
    registerPersonalHealthTools(
      server,
      this.personalHealthDataGateway,
      req.mcpUserId,
    );

    const transport = new NodeStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body as unknown);
  }
}
