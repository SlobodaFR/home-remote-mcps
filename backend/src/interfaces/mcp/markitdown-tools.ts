import { CallToolResult, McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { MarkitdownGateway } from '../../application/mcp/markitdown-gateway';

async function toToolResult(
  call: () => Promise<{ markdown: string }>,
): Promise<CallToolResult> {
  try {
    const result = await call();
    return { content: [{ type: 'text', text: result.markdown }] };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: error instanceof Error ? error.message : String(error),
        },
      ],
      isError: true,
    };
  }
}

/**
 * Converts documents to Markdown via the markitdown-connector sidecar - see
 * MarkitdownConnector for why this needs Python. No credentials involved,
 * so unlike every other tools file there is no "not connected" state to
 * handle: failures are just conversion errors (bad URL, unsupported
 * format), surfaced as an MCP tool error.
 */
export function registerMarkitdownTools(
  server: McpServer,
  gateway: MarkitdownGateway,
): void {
  server.registerTool(
    'markitdown_convert_url',
    {
      description:
        'Fetch a document at a URL (PDF, Word/PowerPoint/Excel, HTML, image, CSV/JSON/XML, ZIP, EPub, YouTube link, ...) and convert it to Markdown',
      inputSchema: z.object({ url: z.string() }),
    },
    ({ url }) => toToolResult(() => gateway.convertUrl(url)),
  );

  server.registerTool(
    'markitdown_convert_content',
    {
      description:
        'Convert base64-encoded file content (PDF, Word/PowerPoint/Excel, image, ...) to Markdown. `filename` (with extension) helps pick the right converter.',
      inputSchema: z.object({
        base64Content: z.string(),
        filename: z.string().optional(),
      }),
    },
    ({ base64Content, filename }) =>
      toToolResult(() => gateway.convertContent(base64Content, filename)),
  );
}
