import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { InstagramDataGateway } from '../../application/mcp/instagram-data-gateway';
import { makeInstagramRunner } from './instagram-tool-runtime';

const PROFILE_FIELDS =
  'id,username,name,biography,website,profile_picture_url,followers_count,follows_count,media_count';
const MEDIA_FIELDS =
  'id,media_type,media_url,permalink,thumbnail_url,caption,timestamp,like_count,comments_count';

const MEDIA_INSIGHT_METRICS = [
  'reach',
  'likes',
  'comments',
  'shares',
  'saved',
  'video_views',
] as const;

const ACCOUNT_INSIGHT_METRICS = [
  'reach',
  'profile_views',
  'website_clicks',
  'accounts_engaged',
] as const;

/**
 * Reproduces the tool surface of jlbadano/ig-mcp (Python) directly against
 * Meta's Graph API - see InstagramConnector for why there's no sidecar here.
 * Unlike that reference implementation, publish_media skips client-side
 * image-aspect-ratio validation (would need an image-decoding dependency);
 * the Graph API itself rejects unsupported ratios with a clear error.
 */
export function registerInstagramTools(
  server: McpServer,
  gateway: InstagramDataGateway,
  userId: string,
  accountName: string,
): void {
  const run = makeInstagramRunner(gateway, userId, accountName);

  server.registerTool(
    'instagram_get_profile_info',
    {
      description:
        "Get this Instagram professional account's profile info: followers, bio, website, media count (Graph API: GET /{ig-user-id})",
      inputSchema: z.object({}),
    },
    () =>
      run((connector, credentials) =>
        connector.request(
          credentials.accessToken,
          'GET',
          credentials.igUserId,
          {
            queryParams: { fields: PROFILE_FIELDS },
          },
        ),
      ),
  );

  server.registerTool(
    'instagram_get_media_posts',
    {
      description:
        'List recent media posts with engagement counts (Graph API: GET /{ig-user-id}/media)',
      inputSchema: z.object({
        limit: z.number().int().min(1).max(100).default(25),
        after: z
          .string()
          .optional()
          .describe('Pagination cursor from a previous response'),
      }),
    },
    ({ limit, after }) =>
      run((connector, credentials) =>
        connector.request(
          credentials.accessToken,
          'GET',
          `${credentials.igUserId}/media`,
          {
            queryParams: {
              fields: MEDIA_FIELDS,
              limit: limit.toString(),
              ...(after ? { after } : {}),
            },
          },
        ),
      ),
  );

  server.registerTool(
    'instagram_get_media_insights',
    {
      description:
        'Get engagement insights for one media post (Graph API: GET /{media-id}/insights). video_views only applies to video posts.',
      inputSchema: z.object({
        mediaId: z.string(),
        metrics: z.array(z.enum(MEDIA_INSIGHT_METRICS)).optional(),
      }),
    },
    ({ mediaId, metrics }) =>
      run((connector, credentials) =>
        connector.request(
          credentials.accessToken,
          'GET',
          `${mediaId}/insights`,
          {
            queryParams: {
              metric: (
                metrics ?? ['reach', 'likes', 'comments', 'shares', 'saved']
              ).join(','),
            },
          },
        ),
      ),
  );

  server.registerTool(
    'instagram_publish_media',
    {
      description:
        'Publish an image or video to this Instagram account (Graph API: POST /{ig-user-id}/media then POST /{ig-user-id}/media_publish). Exactly one of imageUrl/videoUrl is required, and it must be a publicly reachable URL.',
      inputSchema: z.object({
        imageUrl: z.url().optional(),
        videoUrl: z.url().optional(),
        caption: z.string().optional(),
        locationId: z
          .string()
          .optional()
          .describe('Facebook location id for geotagging'),
      }),
    },
    ({ imageUrl, videoUrl, caption, locationId }) =>
      run(async (connector, credentials) => {
        if (!imageUrl && !videoUrl) {
          throw new Error('Either imageUrl or videoUrl is required.');
        }
        const containerBody: Record<string, unknown> = {
          caption: caption ?? '',
        };
        if (imageUrl) containerBody.image_url = imageUrl;
        if (videoUrl) containerBody.video_url = videoUrl;
        if (locationId) containerBody.location_id = locationId;

        const container = await connector.request<{ id: string }>(
          credentials.accessToken,
          'POST',
          `${credentials.igUserId}/media`,
          { jsonBody: containerBody },
        );
        const published = await connector.request<{ id: string }>(
          credentials.accessToken,
          'POST',
          `${credentials.igUserId}/media_publish`,
          { jsonBody: { creation_id: container.id } },
        );
        return { id: published.id };
      }),
  );

  server.registerTool(
    'instagram_get_account_pages',
    {
      description:
        'List Facebook Pages this token can access, with their linked Instagram business account if any (Graph API: GET /me/accounts)',
      inputSchema: z.object({}),
    },
    () =>
      run((connector, credentials) =>
        connector.request(credentials.accessToken, 'GET', 'me/accounts', {
          queryParams: {
            fields: 'id,name,instagram_business_account{id,username}',
          },
        }),
      ),
  );

  server.registerTool(
    'instagram_get_account_insights',
    {
      description:
        'Get account-level insights (Graph API: GET /{ig-user-id}/insights)',
      inputSchema: z.object({
        metrics: z.array(z.enum(ACCOUNT_INSIGHT_METRICS)).optional(),
        period: z.enum(['day', 'lifetime']).default('day'),
      }),
    },
    ({ metrics, period }) =>
      run((connector, credentials) =>
        connector.request(
          credentials.accessToken,
          'GET',
          `${credentials.igUserId}/insights`,
          {
            queryParams: {
              metric: (
                metrics ?? ['reach', 'profile_views', 'website_clicks']
              ).join(','),
              period,
              metric_type: 'total_value',
            },
          },
        ),
      ),
  );

  server.registerTool(
    'instagram_validate_access_token',
    {
      description:
        'Check whether the stored access token is still valid (Graph API: GET /me)',
      inputSchema: z.object({}),
    },
    () =>
      run(async (connector, credentials) => {
        try {
          await connector.request(credentials.accessToken, 'GET', 'me', {
            queryParams: { fields: 'id' },
          });
          return { valid: true };
        } catch {
          return { valid: false };
        }
      }),
  );

  server.registerTool(
    'instagram_get_conversations',
    {
      description:
        "List Instagram DM conversations for this account's Page (Graph API: GET /{page-id}/conversations). Requires the instagram_manage_messages permission with Advanced Access from Meta.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(100).default(25),
      }),
    },
    ({ limit }) =>
      run((connector, credentials) =>
        connector.request(
          credentials.accessToken,
          'GET',
          `${credentials.pageId}/conversations`,
          {
            queryParams: {
              platform: 'instagram',
              fields: 'id,updated_time,message_count',
              limit: limit.toString(),
            },
          },
        ),
      ),
  );

  server.registerTool(
    'instagram_get_conversation_messages',
    {
      description:
        'Get messages from one Instagram DM conversation (Graph API: GET /{conversation-id}). Use instagram_get_conversations to get conversation ids. Requires Advanced Access.',
      inputSchema: z.object({
        conversationId: z.string(),
        limit: z.number().int().min(1).max(100).default(25),
      }),
    },
    ({ conversationId, limit }) =>
      run((connector, credentials) =>
        connector.request(credentials.accessToken, 'GET', conversationId, {
          queryParams: {
            fields: `messages.limit(${limit.toString()}){id,from,to,message,created_time,attachments}`,
          },
        }),
      ),
  );

  server.registerTool(
    'instagram_send_dm',
    {
      description:
        "Send an Instagram direct message (Graph API: POST /me/messages). Can only reply within 24 hours of the recipient's last message, and the recipient must have messaged first. Requires the instagram_manage_messages permission with Advanced Access from Meta.",
      inputSchema: z.object({
        recipientId: z
          .string()
          .describe("Recipient's Instagram-Scoped User ID (IGSID)"),
        message: z.string().max(1000),
      }),
    },
    ({ recipientId, message }) =>
      run((connector, credentials) =>
        connector.request(credentials.accessToken, 'POST', 'me/messages', {
          jsonBody: {
            recipient: { id: recipientId },
            message: { text: message },
          },
        }),
      ),
  );
}
