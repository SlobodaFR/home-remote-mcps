import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { CompleteYoutubeConnectionUseCase } from '../../../application/credentials/complete-youtube-connection.use-case';
import { DeleteCredentialUseCase } from '../../../application/credentials/delete-credential.use-case';
import { ListCredentialsUseCase } from '../../../application/credentials/list-credentials.use-case';
import {
  SaveHomeAssistantConnectionResult,
  SaveHomeAssistantConnectionUseCase,
} from '../../../application/credentials/save-home-assistant-connection.use-case';
import {
  StartGarminLoginResult,
  StartGarminLoginUseCase,
} from '../../../application/credentials/start-garmin-login.use-case';
import {
  StartYoutubeConnectionResult,
  StartYoutubeConnectionUseCase,
} from '../../../application/credentials/start-youtube-connection.use-case';
import {
  SubmitGarminMfaResult,
  SubmitGarminMfaUseCase,
} from '../../../application/credentials/submit-garmin-mfa.use-case';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../decorators/current-user.decorator';
import { Public } from '../decorators/public.decorator';
import { SaveHomeAssistantConnectionDto } from '../dto/save-home-assistant-connection.dto';
import { StartGarminLoginDto } from '../dto/start-garmin-login.dto';
import { StartYoutubeConnectionDto } from '../dto/start-youtube-connection.dto';
import { SubmitGarminMfaDto } from '../dto/submit-garmin-mfa.dto';
import {
  CredentialDto,
  toCredentialDto,
} from '../presenters/credential.presenter';

@Controller('credentials')
export class CredentialsController {
  constructor(
    private readonly listCredentials: ListCredentialsUseCase,
    private readonly startGarminLogin: StartGarminLoginUseCase,
    private readonly submitGarminMfa: SubmitGarminMfaUseCase,
    private readonly saveHomeAssistantConnection: SaveHomeAssistantConnectionUseCase,
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

  @Post('youtube/start')
  async startYoutube(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: StartYoutubeConnectionDto,
  ): Promise<StartYoutubeConnectionResult> {
    return this.startYoutubeConnection.execute(
      user.id,
      dto.clientId,
      dto.clientSecret,
      this.youtubeCallbackUrl(),
    );
  }

  @Public()
  @Get('youtube/callback')
  async youtubeCallback(
    @Query('state') pendingId: string,
    @Query('code') code: string,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
    if (error) {
      res.redirect(
        `${frontendUrl}/credentials?youtube=error&message=${encodeURIComponent(error)}`,
      );
      return;
    }
    const result = await this.completeYoutubeConnection.execute(
      pendingId,
      code,
      this.youtubeCallbackUrl(),
    );
    res.redirect(
      result.status === 'ok'
        ? `${frontendUrl}/credentials?youtube=ok`
        : `${frontendUrl}/credentials?youtube=error&message=${encodeURIComponent(result.message)}`,
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
