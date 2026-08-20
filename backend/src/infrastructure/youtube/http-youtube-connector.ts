import { Injectable } from '@nestjs/common';
import {
  YoutubeConnector,
  YoutubeCredentials,
  YoutubeDataResult,
  YoutubeTokenExchangeResult,
} from '../../domain/youtube/youtube-connector';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const DATA_API = 'https://www.googleapis.com/youtube/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/youtube/v3';
const ANALYTICS_API = 'https://youtubeanalytics.googleapis.com/v2/reports';

const SCOPES = [
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
  'https://www.googleapis.com/auth/yt-analytics-monetary.readonly',
];

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  error?: string;
  error_description?: string;
}

interface GoogleErrorBody {
  error?: { message?: string };
}

/**
 * Talks directly to Google's OAuth2 endpoint and the YouTube Data/Analytics
 * REST APIs - no googleapis client library, since the surface needed (22
 * actions, see youtube-tools.ts) is small enough that raw fetch calls stay
 * readable and avoid a heavy dependency. `dispatch` is the one place that
 * knows the REST shape of each action; `call` wraps it with access-token
 * refresh (Google access tokens expire hourly and don't auto-refresh like
 * Garmin's underlying library does).
 */
@Injectable()
export class HttpYoutubeConnector extends YoutubeConnector {
  authorizeUrl(clientId: string, redirectUri: string, state: string): string {
    const url = new URL(AUTH_URL);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', SCOPES.join(' '));
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('state', state);
    return url.toString();
  }

  async exchangeCode(
    clientId: string,
    clientSecret: string,
    code: string,
    redirectUri: string,
  ): Promise<YoutubeTokenExchangeResult> {
    return this.requestToken({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });
  }

  private async refreshAccessToken(
    clientId: string,
    clientSecret: string,
    refreshToken: string,
  ): Promise<YoutubeTokenExchangeResult> {
    const result = await this.requestToken({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });
    // Google omits refresh_token on refresh grants - carry the existing one forward.
    return result.status === 'ok'
      ? { ...result, refreshToken: result.refreshToken || refreshToken }
      : result;
  }

  private async requestToken(
    params: Record<string, string>,
  ): Promise<YoutubeTokenExchangeResult> {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    });
    const body = (await response.json()) as GoogleTokenResponse;
    if (!response.ok || !body.access_token) {
      return {
        status: 'error',
        message:
          body.error_description ??
          body.error ??
          `Google token request failed: ${response.status.toString()}`,
      };
    }
    if (!body.refresh_token && params.grant_type === 'authorization_code') {
      return {
        status: 'error',
        message:
          "Google did not return a refresh token. Revoke this app's access at https://myaccount.google.com/permissions and try connecting again.",
      };
    }
    return {
      status: 'ok',
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? '',
      expiresIn: body.expires_in,
    };
  }

  async call<T>(
    credentialsJson: string,
    action: string,
    params: Record<string, unknown>,
  ): Promise<YoutubeDataResult<T>> {
    let credentials = JSON.parse(credentialsJson) as YoutubeCredentials;
    let refreshedCredentialsJson: string | undefined;
    let accessToken = credentials.accessToken;

    const expiresAt = credentials.accessTokenExpiresAt
      ? Date.parse(credentials.accessTokenExpiresAt)
      : 0;
    if (!accessToken || expiresAt - 60_000 <= Date.now()) {
      const refreshed = await this.refreshAccessToken(
        credentials.clientId,
        credentials.clientSecret,
        credentials.refreshToken,
      );
      if (refreshed.status === 'error') {
        throw new Error(`YouTube token refresh failed: ${refreshed.message}`);
      }
      accessToken = refreshed.accessToken;
      credentials = {
        ...credentials,
        accessToken,
        refreshToken: refreshed.refreshToken,
        accessTokenExpiresAt: new Date(
          Date.now() + refreshed.expiresIn * 1000,
        ).toISOString(),
      };
      refreshedCredentialsJson = JSON.stringify(credentials);
    }

    const data = await this.dispatch<T>(accessToken, action, params);
    return { data, refreshedCredentialsJson };
  }

  private async dispatch<T>(
    accessToken: string,
    action: string,
    p: Record<string, unknown>,
  ): Promise<T> {
    switch (action) {
      case 'get_channel':
        return this.dataGet(accessToken, '/channels', {
          part: 'snippet,statistics,brandingSettings,contentDetails,status',
          mine: 'true',
        });

      case 'update_channel':
        return this.updateChannel(accessToken, p);

      case 'list_videos':
        return this.listVideos(accessToken, p);

      case 'get_video':
        return this.dataGet(accessToken, '/videos', {
          part: 'snippet,statistics,status,contentDetails,player',
          id: this.required(p, 'videoId'),
        });

      case 'upload_video':
        return this.uploadVideo(accessToken, p);

      case 'update_video':
        return this.updateVideo(accessToken, p);

      case 'delete_video':
        return this.dataRequest(accessToken, 'DELETE', '/videos', {
          query: { id: this.required(p, 'videoId') },
        });

      case 'set_thumbnail':
        return this.setThumbnail(accessToken, p);

      case 'list_playlists':
        return this.dataGet(accessToken, '/playlists', {
          part: 'snippet,status,contentDetails',
          ...(p.channelId
            ? { channelId: p.channelId as string }
            : { mine: 'true' }),
          maxResults: this.num(p, 'maxResults', 25),
        });

      case 'create_playlist':
        return this.dataRequest(accessToken, 'POST', '/playlists', {
          query: { part: 'snippet,status' },
          jsonBody: {
            snippet: {
              title: this.required(p, 'title'),
              description: p.description ?? '',
            },
            status: { privacyStatus: p.privacyStatus ?? 'private' },
          },
        });

      case 'update_playlist':
        return this.updatePlaylist(accessToken, p);

      case 'add_to_playlist':
        return this.dataRequest(accessToken, 'POST', '/playlistItems', {
          query: { part: 'snippet' },
          jsonBody: {
            snippet: {
              playlistId: this.required(p, 'playlistId'),
              position: p.position,
              resourceId: {
                kind: 'youtube#video',
                videoId: this.required(p, 'videoId'),
              },
            },
          },
        });

      case 'remove_from_playlist':
        return this.removeFromPlaylist(accessToken, p);

      case 'delete_playlist':
        return this.dataRequest(accessToken, 'DELETE', '/playlists', {
          query: { id: this.required(p, 'playlistId') },
        });

      case 'list_comments':
        return this.dataGet(accessToken, '/commentThreads', {
          part: 'snippet,replies',
          videoId: this.required(p, 'videoId'),
          maxResults: this.num(p, 'maxResults', 25),
          order: this.str(p, 'order', 'time'),
        });

      case 'reply_to_comment':
        return this.dataRequest(accessToken, 'POST', '/comments', {
          query: { part: 'snippet' },
          jsonBody: {
            snippet: {
              parentId: this.required(p, 'parentCommentId'),
              textOriginal: this.required(p, 'text'),
            },
          },
        });

      case 'delete_comment':
        return this.dataRequest(accessToken, 'DELETE', '/comments', {
          query: { id: this.required(p, 'commentId') },
        });

      case 'search_youtube':
        return this.dataGet(accessToken, '/search', {
          part: 'snippet',
          q: this.required(p, 'query'),
          type: this.str(p, 'type', 'video,channel,playlist'),
          maxResults: this.num(p, 'maxResults', 10),
        });

      case 'get_analytics':
        return this.dataGetRaw(ANALYTICS_API, accessToken, {
          ids: 'channel==MINE',
          startDate: this.required(p, 'startDate'),
          endDate: this.required(p, 'endDate'),
          metrics:
            (Array.isArray(p.metrics)
              ? (p.metrics as string[]).join(',')
              : undefined) ??
            'views,estimatedMinutesWatched,subscribersGained,estimatedRevenue',
        });

      case 'get_top_videos': {
        const metric = this.str(p, 'metric', 'views');
        return this.dataGetRaw(ANALYTICS_API, accessToken, {
          ids: 'channel==MINE',
          startDate: this.required(p, 'startDate'),
          endDate: this.required(p, 'endDate'),
          metrics: metric,
          dimensions: 'video',
          sort: `-${metric}`,
          maxResults: this.num(p, 'maxResults', 10),
        });
      }

      case 'list_captions':
        return this.dataGet(accessToken, '/captions', {
          part: 'snippet',
          videoId: this.required(p, 'videoId'),
        });

      case 'list_categories':
        return this.dataGet(accessToken, '/videoCategories', {
          part: 'snippet',
          regionCode: this.str(p, 'regionCode', 'US'),
        });

      default:
        throw new Error(`Unknown YouTube action: ${action}`);
    }
  }

  private async updateChannel<T>(
    accessToken: string,
    p: Record<string, unknown>,
  ): Promise<T> {
    const current = await this.dataGet<{
      items: {
        id: string;
        brandingSettings?: { channel?: Record<string, unknown> };
      }[];
    }>(accessToken, '/channels', { part: 'id,brandingSettings', mine: 'true' });
    if (current.items.length === 0)
      throw new Error('No YouTube channel found for this account');
    const channel = current.items[0];

    const editableFields = [
      'description',
      'keywords',
      'country',
      'defaultLanguage',
      'unsubscribedTrailer',
    ] as const;
    const patch = Object.fromEntries(
      editableFields
        .filter((field) => p[field] !== undefined)
        .map((field) => [field, p[field]]),
    );
    return this.dataRequest(accessToken, 'PUT', '/channels', {
      query: { part: 'brandingSettings' },
      jsonBody: {
        id: channel.id,
        brandingSettings: {
          channel: { ...channel.brandingSettings?.channel, ...patch },
        },
      },
    });
  }

  private async listVideos<T>(
    accessToken: string,
    p: Record<string, unknown>,
  ): Promise<T> {
    if (p.playlistId) {
      return this.dataGet(accessToken, '/playlistItems', {
        part: 'snippet,contentDetails',
        playlistId: p.playlistId as string,
        maxResults: this.num(p, 'maxResults', 25),
      });
    }
    return this.dataGet(accessToken, '/search', {
      part: 'snippet',
      type: 'video',
      order: this.str(p, 'orderBy', 'date'),
      maxResults: this.num(p, 'maxResults', 25),
      ...(p.channelId
        ? { channelId: p.channelId as string }
        : { forMine: 'true' }),
    });
  }

  private async uploadVideo<T>(
    accessToken: string,
    p: Record<string, unknown>,
  ): Promise<T> {
    const fileBase64 = this.required(p, 'fileBase64');
    const mimeType = this.required(p, 'mimeType');
    const metadata = {
      snippet: {
        title: this.required(p, 'title'),
        description: p.description ?? '',
        tags: p.tags,
        categoryId: p.categoryId,
      },
      status: { privacyStatus: p.privacyStatus ?? 'unlisted' },
    };
    const boundary = 'youtube_mcp_boundary';
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
      ),
      Buffer.from(fileBase64, 'base64'),
      Buffer.from(`\r\n--${boundary}--`),
    ]);

    const response = await fetch(
      `${UPLOAD_API}/videos?uploadType=multipart&part=snippet,status`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      },
    );
    const uploaded = await this.parseResponse<{ id: string }>(response);

    if (p.playlistId) {
      await this.dataRequest(accessToken, 'POST', '/playlistItems', {
        query: { part: 'snippet' },
        jsonBody: {
          snippet: {
            playlistId: p.playlistId,
            resourceId: { kind: 'youtube#video', videoId: uploaded.id },
          },
        },
      });
    }
    return uploaded as T;
  }

  private async updateVideo<T>(
    accessToken: string,
    p: Record<string, unknown>,
  ): Promise<T> {
    const videoId = this.required(p, 'videoId');
    const current = await this.dataGet<{
      items: {
        snippet: Record<string, unknown>;
        status: Record<string, unknown>;
      }[];
    }>(accessToken, '/videos', { part: 'snippet,status', id: videoId });
    if (current.items.length === 0)
      throw new Error(`Video not found: ${videoId}`);
    const existing = current.items[0];

    return this.dataRequest(accessToken, 'PUT', '/videos', {
      query: { part: 'snippet,status' },
      jsonBody: {
        id: videoId,
        snippet: {
          ...existing.snippet,
          ...(p.title !== undefined ? { title: p.title } : {}),
          ...(p.description !== undefined
            ? { description: p.description }
            : {}),
          ...(p.tags !== undefined ? { tags: p.tags } : {}),
          ...(p.categoryId !== undefined ? { categoryId: p.categoryId } : {}),
        },
        status: {
          ...existing.status,
          ...(p.privacyStatus !== undefined
            ? { privacyStatus: p.privacyStatus }
            : {}),
        },
      },
    });
  }

  private async setThumbnail<T>(
    accessToken: string,
    p: Record<string, unknown>,
  ): Promise<T> {
    const videoId = this.required(p, 'videoId');
    const imageBase64 = this.required(p, 'imageBase64');
    const mimeType = this.required(p, 'mimeType');
    const response = await fetch(
      `${UPLOAD_API}/thumbnails/set?uploadType=media&videoId=${encodeURIComponent(videoId)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': mimeType,
        },
        body: Buffer.from(imageBase64, 'base64'),
      },
    );
    return this.parseResponse<T>(response);
  }

  private async updatePlaylist<T>(
    accessToken: string,
    p: Record<string, unknown>,
  ): Promise<T> {
    const playlistId = this.required(p, 'playlistId');
    const current = await this.dataGet<{
      items: {
        snippet: Record<string, unknown>;
        status: Record<string, unknown>;
      }[];
    }>(accessToken, '/playlists', { part: 'snippet,status', id: playlistId });
    if (current.items.length === 0)
      throw new Error(`Playlist not found: ${playlistId}`);
    const existing = current.items[0];

    return this.dataRequest(accessToken, 'PUT', '/playlists', {
      query: { part: 'snippet,status' },
      jsonBody: {
        id: playlistId,
        snippet: {
          ...existing.snippet,
          ...(p.title !== undefined ? { title: p.title } : {}),
          ...(p.description !== undefined
            ? { description: p.description }
            : {}),
        },
        status: {
          ...existing.status,
          ...(p.privacyStatus !== undefined
            ? { privacyStatus: p.privacyStatus }
            : {}),
        },
      },
    });
  }

  private async removeFromPlaylist<T>(
    accessToken: string,
    p: Record<string, unknown>,
  ): Promise<T> {
    if (p.playlistItemId) {
      return this.dataRequest(accessToken, 'DELETE', '/playlistItems', {
        query: { id: p.playlistItemId as string },
      });
    }
    const playlistId = this.required(p, 'playlistId');
    const videoId = this.required(p, 'videoId');
    const items = await this.dataGet<{
      items: { id: string; snippet: { resourceId: { videoId: string } } }[];
    }>(accessToken, '/playlistItems', {
      part: 'snippet',
      playlistId,
      maxResults: '50',
    });
    const match = items.items.find(
      (item) => item.snippet.resourceId.videoId === videoId,
    );
    if (!match)
      throw new Error(`Video ${videoId} not found in playlist ${playlistId}`);
    return this.dataRequest(accessToken, 'DELETE', '/playlistItems', {
      query: { id: match.id },
    });
  }

  private str(
    p: Record<string, unknown>,
    key: string,
    fallback: string,
  ): string {
    const value = p[key];
    return typeof value === 'string' && value.length > 0 ? value : fallback;
  }

  private num(
    p: Record<string, unknown>,
    key: string,
    fallback: number,
  ): string {
    const value = p[key];
    return String(typeof value === 'number' ? value : fallback);
  }

  private required(p: Record<string, unknown>, key: string): string {
    const value = p[key];
    if (value === undefined || value === null || value === '') {
      throw new Error(`Missing required parameter: ${key}`);
    }
    return value as string;
  }

  private dataGet<T>(
    accessToken: string,
    path: string,
    query: Record<string, string>,
  ): Promise<T> {
    return this.dataGetRaw(`${DATA_API}${path}`, accessToken, query);
  }

  private async dataGetRaw<T>(
    baseUrl: string,
    accessToken: string,
    query: Record<string, string>,
  ): Promise<T> {
    const url = new URL(baseUrl);
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return this.parseResponse<T>(response);
  }

  private async dataRequest<T>(
    accessToken: string,
    httpMethod: 'POST' | 'PUT' | 'DELETE',
    path: string,
    options: { query?: Record<string, string>; jsonBody?: unknown },
  ): Promise<T> {
    const url = new URL(`${DATA_API}${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(key, value);
    }
    const response = await fetch(url, {
      method: httpMethod,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body:
        options.jsonBody === undefined
          ? undefined
          : JSON.stringify(options.jsonBody),
    });
    return this.parseResponse<T>(response);
  }

  private async parseResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const errorBody = (await response
        .json()
        .catch(() => ({}))) as GoogleErrorBody;
      throw new Error(
        errorBody.error?.message ??
          `YouTube API request failed: ${response.status.toString()}`,
      );
    }
    if (response.status === 204) {
      return undefined as T;
    }
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
}
