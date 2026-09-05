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
import { OpenAiDataGateway } from '../../application/mcp/openai-data-gateway';
import { Public } from '../http/decorators/public.decorator';
import {
  ApiKeyGuard,
  McpAuthenticatedRequest,
} from '../http/guards/api-key.guard';
import { registerOpenAiTools } from './openai-tools';

/**
 * One MCP server instance per request, scoped to the user resolved from the
 * API key in the URL by ApiKeyGuard - see GarminMcpController for the full
 * rationale. Like Instagram, the route carries a second path segment: a user
 * can hold several OpenAI API keys, so `connectionName` (chosen when
 * connecting it in the web UI) picks which one this MCP endpoint talks to.
 */
@Public()
@UseGuards(ApiKeyGuard)
@Controller('mcp/openai')
export class OpenAiMcpController {
  constructor(private readonly openAiDataGateway: OpenAiDataGateway) {}

  @Post(':apiKey/:connectionName')
  async handle(
    @Req() req: McpAuthenticatedRequest,
    @Res() res: Response,
    @Param('connectionName') connectionName: string,
  ): Promise<void> {
    if (!req.mcpUserId) {
      throw new InternalServerErrorException(
        'ApiKeyGuard did not resolve a user',
      );
    }

    const server = new McpServer({
      name: 'home-remote-mcps-openai',
      version: '1.0.0',
    });
    registerOpenAiTools(
      server,
      this.openAiDataGateway,
      req.mcpUserId,
      connectionName,
    );

    const transport = new NodeStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body as unknown);
  }
}
