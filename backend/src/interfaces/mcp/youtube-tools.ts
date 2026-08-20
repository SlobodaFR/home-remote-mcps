import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import {
  YoutubeDataGateway,
  YoutubeNotConnectedError,
} from '../../application/mcp/youtube-data-gateway';

interface ToolParam {
  name: string;
  zod: z.ZodType;
}

interface ToolDef {
  action: string;
  description: string;
  params: ToolParam[];
}

/**
 * One entry per action supported by HttpYoutubeConnector.dispatch - the same
 * 22 actions as github.com/mrchevyceleb/youtube-mcp, exposed as one MCP tool
 * each (rather than that project's single action-router tool) to match this
 * repo's convention (see garmin-tools.ts). `upload_video`/`set_thumbnail`
 * take base64 file contents instead of a local file path, since this server
 * runs remotely and has no access to the calling client's filesystem.
 */
const TOOL_DEFS: ToolDef[] = [
  {
    action: 'get_channel',
    description: "Get the connected channel's info: name, stats, branding",
    params: [],
  },
  {
    action: 'update_channel',
    description:
      "Update the channel's description, keywords, country, default language or trailer video",
    params: [
      { name: 'description', zod: z.string().optional() },
      { name: 'keywords', zod: z.string().optional() },
      { name: 'country', zod: z.string().optional() },
      { name: 'defaultLanguage', zod: z.string().optional() },
      { name: 'unsubscribedTrailer', zod: z.string().optional() },
    ],
  },
  {
    action: 'list_videos',
    description:
      'List videos from the connected channel, another channel, or a playlist',
    params: [
      { name: 'channelId', zod: z.string().optional() },
      { name: 'playlistId', zod: z.string().optional() },
      { name: 'maxResults', zod: z.number().int().optional() },
      {
        name: 'orderBy',
        zod: z
          .enum(['date', 'rating', 'relevance', 'title', 'viewCount'])
          .optional(),
      },
    ],
  },
  {
    action: 'get_video',
    description: 'Get full details for one video: stats, tags, status',
    params: [{ name: 'videoId', zod: z.string() }],
  },
  {
    action: 'upload_video',
    description:
      'Upload a video from base64-encoded file contents (resumable/large uploads are not supported - keep clips small)',
    params: [
      { name: 'fileBase64', zod: z.string() },
      { name: 'mimeType', zod: z.string() },
      { name: 'title', zod: z.string() },
      { name: 'description', zod: z.string().optional() },
      { name: 'tags', zod: z.array(z.string()).optional() },
      { name: 'categoryId', zod: z.string().optional() },
      {
        name: 'privacyStatus',
        zod: z.enum(['public', 'unlisted', 'private']).optional(),
      },
      { name: 'playlistId', zod: z.string().optional() },
    ],
  },
  {
    action: 'update_video',
    description:
      "Update a video's title, description, tags, category or privacy",
    params: [
      { name: 'videoId', zod: z.string() },
      { name: 'title', zod: z.string().optional() },
      { name: 'description', zod: z.string().optional() },
      { name: 'tags', zod: z.array(z.string()).optional() },
      { name: 'categoryId', zod: z.string().optional() },
      {
        name: 'privacyStatus',
        zod: z.enum(['public', 'unlisted', 'private']).optional(),
      },
    ],
  },
  {
    action: 'delete_video',
    description: 'Permanently delete a video',
    params: [{ name: 'videoId', zod: z.string() }],
  },
  {
    action: 'set_thumbnail',
    description:
      'Upload a custom thumbnail from base64-encoded image contents (JPEG/PNG/BMP, max 2MB)',
    params: [
      { name: 'videoId', zod: z.string() },
      { name: 'imageBase64', zod: z.string() },
      { name: 'mimeType', zod: z.string() },
    ],
  },
  {
    action: 'list_playlists',
    description: 'List playlists from the connected channel or another channel',
    params: [
      { name: 'channelId', zod: z.string().optional() },
      { name: 'maxResults', zod: z.number().int().optional() },
    ],
  },
  {
    action: 'create_playlist',
    description: 'Create a new playlist',
    params: [
      { name: 'title', zod: z.string() },
      { name: 'description', zod: z.string().optional() },
      {
        name: 'privacyStatus',
        zod: z.enum(['public', 'unlisted', 'private']).optional(),
      },
    ],
  },
  {
    action: 'update_playlist',
    description: "Update a playlist's title, description or privacy",
    params: [
      { name: 'playlistId', zod: z.string() },
      { name: 'title', zod: z.string().optional() },
      { name: 'description', zod: z.string().optional() },
      {
        name: 'privacyStatus',
        zod: z.enum(['public', 'unlisted', 'private']).optional(),
      },
    ],
  },
  {
    action: 'add_to_playlist',
    description: 'Add a video to a playlist, optionally at a specific position',
    params: [
      { name: 'playlistId', zod: z.string() },
      { name: 'videoId', zod: z.string() },
      { name: 'position', zod: z.number().int().optional() },
    ],
  },
  {
    action: 'remove_from_playlist',
    description:
      'Remove a video from a playlist (by playlistId+videoId, or a playlistItemId directly)',
    params: [
      { name: 'playlistId', zod: z.string().optional() },
      { name: 'videoId', zod: z.string().optional() },
      { name: 'playlistItemId', zod: z.string().optional() },
    ],
  },
  {
    action: 'delete_playlist',
    description: 'Permanently delete a playlist',
    params: [{ name: 'playlistId', zod: z.string() }],
  },
  {
    action: 'list_comments',
    description: 'List top-level comment threads on a video',
    params: [
      { name: 'videoId', zod: z.string() },
      { name: 'maxResults', zod: z.number().int().optional() },
      { name: 'order', zod: z.enum(['time', 'relevance']).optional() },
    ],
  },
  {
    action: 'reply_to_comment',
    description: 'Reply to a comment',
    params: [
      { name: 'parentCommentId', zod: z.string() },
      { name: 'text', zod: z.string() },
    ],
  },
  {
    action: 'delete_comment',
    description: 'Delete a comment you own',
    params: [{ name: 'commentId', zod: z.string() }],
  },
  {
    action: 'search_youtube',
    description: 'Search YouTube for videos, channels, or playlists',
    params: [
      { name: 'query', zod: z.string() },
      { name: 'type', zod: z.string().optional() },
      { name: 'maxResults', zod: z.number().int().optional() },
    ],
  },
  {
    action: 'get_analytics',
    description:
      'Channel analytics for a date range: views, watch time, subscribers, revenue',
    params: [
      { name: 'startDate', zod: z.string() },
      { name: 'endDate', zod: z.string() },
      { name: 'metrics', zod: z.array(z.string()).optional() },
    ],
  },
  {
    action: 'get_top_videos',
    description:
      'Top-performing videos over a date range, ranked by any metric (default views)',
    params: [
      { name: 'startDate', zod: z.string() },
      { name: 'endDate', zod: z.string() },
      { name: 'metric', zod: z.string().optional() },
      { name: 'maxResults', zod: z.number().int().optional() },
    ],
  },
  {
    action: 'list_captions',
    description: 'List available captions/subtitles for a video',
    params: [{ name: 'videoId', zod: z.string() }],
  },
  {
    action: 'list_categories',
    description: 'List assignable video categories for a region (default US)',
    params: [{ name: 'regionCode', zod: z.string().optional() }],
  },
];

function asJsonContent(data: unknown): {
  content: { type: 'text'; text: string }[];
} {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function buildInputSchema(def: ToolDef): z.ZodRawShape {
  return Object.fromEntries(def.params.map((param) => [param.name, param.zod]));
}

/** Registers the full YouTube toolset on a fresh McpServer, scoped to one authenticated user. */
export function registerYoutubeTools(
  server: McpServer,
  gateway: YoutubeDataGateway,
  userId: string,
): void {
  for (const def of TOOL_DEFS) {
    server.registerTool(
      `youtube_${def.action}`,
      {
        description: def.description,
        inputSchema: z.object(buildInputSchema(def)),
      },
      async (input: Record<string, unknown>) => {
        try {
          const data = await gateway.run(userId, (connector, credentialsJson) =>
            connector.call(credentialsJson, def.action, input),
          );
          return asJsonContent(data);
        } catch (error) {
          if (error instanceof YoutubeNotConnectedError) {
            return {
              content: [{ type: 'text' as const, text: error.message }],
              isError: true,
            };
          }
          throw error;
        }
      },
    );
  }
}
