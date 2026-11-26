import { createHash, timingSafeEqual } from 'crypto';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { CompleteYoutubeConnectionUseCase } from '../../../application/credentials/complete-youtube-connection.use-case';
import { DeleteCredentialUseCase } from '../../../application/credentials/delete-credential.use-case';
import { ListCookidooLocalizationsUseCase } from '../../../application/credentials/list-cookidoo-localizations.use-case';
import { ListCredentialsUseCase } from '../../../application/credentials/list-credentials.use-case';
import {
  SaveCookidooConnectionResult,
  SaveCookidooConnectionUseCase,
} from '../../../application/credentials/save-cookidoo-connection.use-case';
import {
  SaveHomeAssistantConnectionResult,
  SaveHomeAssistantConnectionUseCase,
} from '../../../application/credentials/save-home-assistant-connection.use-case';
import {
  SaveInstagramConnectionResult,
  SaveInstagramConnectionUseCase,
} from '../../../application/credentials/save-instagram-connection.use-case';
import {
  SaveLogsConnectionResult,
  SaveLogsConnectionUseCase,
} from '../../../application/credentials/save-logs-connection.use-case';
import {
  SaveMarkitdownConnectionResult,
  SaveMarkitdownConnectionUseCase,
} from '../../../application/credentials/save-markitdown-connection.use-case';
import {
  SaveOpenAiConnectionResult,
  SaveOpenAiConnectionUseCase,
} from '../../../application/credentials/save-openai-connection.use-case';
import {
  SavePersonalHealthConnectionResult,
  SavePersonalHealthConnectionUseCase,
} from '../../../application/credentials/save-personal-health-connection.use-case';
import {
  StartGarminLoginResult,
  StartGarminLoginUseCase,
} from '../../../application/credentials/start-garmin-login.use-case';
import { StartYoutubeConnectionUseCase } from '../../../application/credentials/start-youtube-connection.use-case';
import {
  SubmitGarminMfaResult,
  SubmitGarminMfaUseCase,
} from '../../../application/credentials/submit-garmin-mfa.use-case';
import { CookidooLocalization } from '../../../domain/cookidoo/cookidoo-connector';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../decorators/current-user.decorator';
import {
  clearYoutubeOAuthStateCookie,
  setYoutubeOAuthStateCookie,
  YOUTUBE_OAUTH_STATE_COOKIE_NAME,
} from '../auth-cookies';
import { Public } from '../decorators/public.decorator';
import { SaveCookidooConnectionDto } from '../dto/save-cookidoo-connection.dto';
import { SaveHomeAssistantConnectionDto } from '../dto/save-home-assistant-connection.dto';
import { SaveInstagramConnectionDto } from '../dto/save-instagram-connection.dto';
import { SaveLogsConnectionDto } from '../dto/save-logs-connection.dto';
import { SaveOpenAiConnectionDto } from '../dto/save-openai-connection.dto';
import { SavePersonalHealthConnectionDto } from '../dto/save-personal-health-connection.dto';
import { SameOriginGuard } from '../guards/same-origin.guard';
import { StartGarminLoginDto } from '../dto/start-garmin-login.dto';
import { StartYoutubeConnectionDto } from '../dto/start-youtube-connection.dto';
import { SubmitGarminMfaDto } from '../dto/submit-garmin-mfa.dto';
import {
  CredentialDto,
  toCredentialDto,
} from '../presenters/credential.presenter';

@UseGuards(SameOriginGuard)
@Controller('credentials')
export class CredentialsController {
  constructor(
    private readonly listCredentials: ListCredentialsUseCase,
    private readonly startGarminLogin: StartGarminLoginUseCase,
    private readonly submitGarminMfa: SubmitGarminMfaUseCase,
    private readonly saveCookidooConnection: SaveCookidooConnectionUseCase,
    private readonly listCookidooLocalizations: ListCookidooLocalizationsUseCase,
    private readonly saveHomeAssistantConnection: SaveHomeAssistantConnectionUseCase,
    private readonly saveInstagramConnection: SaveInstagramConnectionUseCase,
    private readonly saveLogsConnection: SaveLogsConnectionUseCase,
    private readonly saveMarkitdownConnection: SaveMarkitdownConnectionUseCase,
    private readonly saveOpenAiConnection: SaveOpenAiConnectionUseCase,
    private readonly savePersonalHealthConnection: SavePersonalHealthConnectionUseCase,
    private readonly startYoutubeConnection: StartYoutubeConnectionUseCase,
    private readonly completeYoutubeConnection: CompleteYoutubeConnectionUseCase,
    private readonly deleteCredential: DeleteCredentialUseCase,
    private readonly config: ConfigService,
  ) {}

  @Get()
  async list(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<CredentialDto[]> {
    const credentials = await this.listCredentials.execute(user.id);
    return credentials.map(toCredentialDto);
  }

  @Post('garmin/login')
  async login(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: StartGarminLoginDto,
  ): Promise<StartGarminLoginResult> {
    return this.startGarminLogin.execute(user.id, dto.email, dto.password);
  }

  @Post('garmin/mfa')
  async mfa(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: SubmitGarminMfaDto,
  ): Promise<SubmitGarminMfaResult> {
    return this.submitGarminMfa.execute(user.id, dto.pendingId, dto.code);
  }

  @Get('cookidoo/localizations')
  async cookidooLocalizations(
    @Query('country') country?: string,
    @Query('language') language?: string,
  ): Promise<CookidooLocalization[]> {
    return this.listCookidooLocalizations.execute(country, language);
  }

  @Post('cookidoo')
  async connectCookidoo(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: SaveCookidooConnectionDto,
  ): Promise<SaveCookidooConnectionResult> {
    return this.saveCookidooConnection.execute(
      user.id,
      dto.email,
      dto.password,
      dto.countryCode,
      dto.language,
    );
  }

  @Post('home-assistant')
  async connectHomeAssistant(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: SaveHomeAssistantConnectionDto,
  ): Promise<SaveHomeAssistantConnectionResult> {
    return this.saveHomeAssistantConnection.execute(
      user.id,
      dto.baseUrl,
      dto.token,
    );
  }

  @Post('instagram')
  async connectInstagram(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: SaveInstagramConnectionDto,
  ): Promise<SaveInstagramConnectionResult> {
    return this.saveInstagramConnection.execute(
      user.id,
      dto.accountName,
      dto.accessToken,
    );
  }

  @Post('logs')
  async connectLogs(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: SaveLogsConnectionDto,
  ): Promise<SaveLogsConnectionResult> {
    return this.saveLogsConnection.execute(user.id, dto.basePath);
  }

  @Post('markitdown')
  async connectMarkitdown(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SaveMarkitdownConnectionResult> {
    return this.saveMarkitdownConnection.execute(user.id);
  }

  @Post('openai')
  async connectOpenAi(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: SaveOpenAiConnectionDto,
  ): Promise<SaveOpenAiConnectionResult> {
    return this.saveOpenAiConnection.execute(
      user.id,
      dto.name,
      dto.apiKey,
      dto.organization,
    );
  }

  @Post('personal-health')
  async connectPersonalHealth(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: SavePersonalHealthConnectionDto,
  ): Promise<SavePersonalHealthConnectionResult> {
    return this.savePersonalHealthConnection.execute(user.id, dto.apiKey);
  }

  @Post('youtube/start')
  async startYoutube(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: StartYoutubeConnectionDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ pendingId: string; authorizeUrl: string }> {
    res.setHeader('Cache-Control', 'no-store');
    const { pendingId, authorizeUrl, state } =
      await this.startYoutubeConnection.execute(
        user.id,
        dto.clientId,
        dto.clientSecret,
        this.youtubeCallbackUrl(),
      );
    setYoutubeOAuthStateCookie(res, state, this.config);
    return { pendingId, authorizeUrl };
  }

  /**
   * Public (Google redirects the browser here). The `state` must equal the
   * cookie set by POST youtube/start (same browser), and is then consumed
   * (single use, 10 min TTL, bound server side to the initiating user). The
   * cookie is checked BEFORE consuming so a cookie-less request cannot burn
   * someone's pending flow.
   */
  @Public()
  @Get('youtube/callback')
  async youtubeCallback(
    @Query('state') state: unknown,
    @Query('code') code: unknown,
    @Query('error') error: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
    const fail = (message: string): void => {
      res.redirect(
        `${frontendUrl}/?youtube=error&message=${encodeURIComponent(message)}`,
      );
    };
    const cookie: unknown = req.cookies[YOUTUBE_OAUTH_STATE_COOKIE_NAME];
    clearYoutubeOAuthStateCookie(res, this.config);
    if (
      typeof state !== 'string' ||
      state === '' ||
      typeof cookie !== 'string' ||
      cookie === '' ||
      !timingSafeEqual(sha256(state), sha256(cookie))
    ) {
      fail('Unknown or expired YouTube connection attempt');
      return;
    }
    if (error !== undefined) {
      await this.completeYoutubeConnection.abort(state);
      fail('Google a refusé la connexion YouTube');
      return;
    }
    if (typeof code !== 'string' || code === '') {
      await this.completeYoutubeConnection.abort(state);
      fail('Missing authorization code');
      return;
    }
    const result = await this.completeYoutubeConnection.execute(
      state,
      code,
      this.youtubeCallbackUrl(),
    );
    res.redirect(
      result.status === 'ok'
        ? `${frontendUrl}/?youtube=ok`
        : `${frontendUrl}/?youtube=error&message=${encodeURIComponent(result.message)}`,
    );
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ): Promise<void> {
    await this.deleteCredential.execute(user.id, id);
  }

  private youtubeCallbackUrl(): string {
    return new URL(
      '/api/credentials/youtube/callback',
      this.config.getOrThrow<string>('PUBLIC_BASE_URL'),
    ).toString();
  }
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}
