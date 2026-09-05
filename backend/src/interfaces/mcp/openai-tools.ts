import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { OpenAiDataGateway } from '../../application/mcp/openai-data-gateway';
import { makeOpenAiRunner } from './openai-tool-runtime';

const CHAT_MESSAGE = z.object({
  role: z.enum(['system', 'user', 'assistant', 'developer']),
  content: z.string(),
});

/**
 * Generic-first OpenAI toolset, same shape as home-assistant-tools.ts: a
 * handful of curated tools for the most common endpoints (models, chat
 * completions, the newer Responses API, embeddings, images, moderations)
 * plus one raw passthrough (`openai_request`) for everything else (files,
 * fine-tuning, assistants, batches...). Endpoints requiring multipart
 * uploads (audio transcription/translation) are out of scope, same tradeoff
 * as Instagram's publish_media.
 */
export function registerOpenAiTools(
  server: McpServer,
  gateway: OpenAiDataGateway,
  userId: string,
  connectionName: string,
): void {
  const run = makeOpenAiRunner(gateway, userId, connectionName);

  server.registerTool(
    'openai_list_models',
    {
      description: 'List models available to this API key (GET /v1/models)',
      inputSchema: z.object({}),
    },
    () =>
      run((connector, credentials) =>
        connector.request(credentials, 'GET', 'models'),
      ),
  );

  server.registerTool(
    'openai_get_model',
    {
      description: 'Get metadata for one model (GET /v1/models/{model})',
      inputSchema: z.object({ model: z.string() }),
    },
    ({ model }) =>
      run((connector, credentials) =>
        connector.request(
          credentials,
          'GET',
          `models/${encodeURIComponent(model)}`,
        ),
      ),
  );

  server.registerTool(
    'openai_create_chat_completion',
    {
      description:
        'Create a chat completion (POST /v1/chat/completions). Use for classic multi-turn chat with a fixed message list.',
      inputSchema: z.object({
        model: z.string(),
        messages: z.array(CHAT_MESSAGE).min(1),
        temperature: z.number().min(0).max(2).optional(),
        maxTokens: z.number().int().positive().optional(),
      }),
    },
    ({ model, messages, temperature, maxTokens }) =>
      run((connector, credentials) =>
        connector.request(credentials, 'POST', 'chat/completions', {
          jsonBody: {
            model,
            messages,
            ...(temperature !== undefined ? { temperature } : {}),
            ...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
          },
        }),
      ),
  );

  server.registerTool(
    'openai_create_response',
    {
      description:
        "Create a model response via OpenAI's unified Responses API (POST /v1/responses) - the current recommended entry point for new integrations, supports plain-text input and optional prior response chaining.",
      inputSchema: z.object({
        model: z.string(),
        input: z.string(),
        instructions: z.string().optional(),
        previousResponseId: z.string().optional(),
      }),
    },
    ({ model, input, instructions, previousResponseId }) =>
      run((connector, credentials) =>
        connector.request(credentials, 'POST', 'responses', {
          jsonBody: {
            model,
            input,
            ...(instructions ? { instructions } : {}),
            ...(previousResponseId
              ? { previous_response_id: previousResponseId }
              : {}),
          },
        }),
      ),
  );

  server.registerTool(
    'openai_create_embedding',
    {
      description:
        'Create embeddings for one or more strings (POST /v1/embeddings)',
      inputSchema: z.object({
        model: z.string(),
        input: z.union([z.string(), z.array(z.string())]),
      }),
    },
    ({ model, input }) =>
      run((connector, credentials) =>
        connector.request(credentials, 'POST', 'embeddings', {
          jsonBody: { model, input },
        }),
      ),
  );

  server.registerTool(
    'openai_create_image',
    {
      description:
        'Generate one or more images from a text prompt (POST /v1/images/generations)',
      inputSchema: z.object({
        model: z.string().optional(),
        prompt: z.string(),
        n: z.number().int().min(1).max(10).optional(),
        size: z.string().optional().describe('e.g. "1024x1024"'),
      }),
    },
    ({ model, prompt, n, size }) =>
      run((connector, credentials) =>
        connector.request(credentials, 'POST', 'images/generations', {
          jsonBody: {
            ...(model ? { model } : {}),
            prompt,
            ...(n !== undefined ? { n } : {}),
            ...(size ? { size } : {}),
          },
        }),
      ),
  );

  server.registerTool(
    'openai_create_moderation',
    {
      description:
        'Classify text for policy-violating content (POST /v1/moderations)',
      inputSchema: z.object({
        input: z.union([z.string(), z.array(z.string())]),
        model: z.string().optional(),
      }),
    },
    ({ input, model }) =>
      run((connector, credentials) =>
        connector.request(credentials, 'POST', 'moderations', {
          jsonBody: { input, ...(model ? { model } : {}) },
        }),
      ),
  );

  server.registerTool(
    'openai_request',
    {
      description:
        'Raw OpenAI REST call (GET/POST/DELETE) for endpoints with no dedicated tool, e.g. "files", "fine_tuning/jobs", "assistants". Path is relative to https://api.openai.com/v1/.',
      inputSchema: z.object({
        httpMethod: z.enum(['GET', 'POST', 'DELETE']),
        path: z.string(),
        jsonBody: z.record(z.string(), z.unknown()).optional(),
        queryParams: z.record(z.string(), z.string()).optional(),
      }),
    },
    ({ httpMethod, path, jsonBody, queryParams }) =>
      run((connector, credentials) =>
        connector.request(credentials, httpMethod, path, {
          jsonBody,
          queryParams,
        }),
      ),
  );
}
