import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreateApiKeyUseCase } from '../../../application/api-keys/create-api-key.use-case';
import { ListApiKeysUseCase } from '../../../application/api-keys/list-api-keys.use-case';
import { RevokeApiKeyUseCase } from '../../../application/api-keys/revoke-api-key.use-case';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../decorators/current-user.decorator';
import { CreateApiKeyDto } from '../dto/create-api-key.dto';
import { ApiKeyDto, toApiKeyDto } from '../presenters/api-key.presenter';
import { CreateApiKeyResponseDto } from '../presenters/create-api-key-response.dto';

@Controller('api-keys')
export class ApiKeysController {
  constructor(
    private readonly createApiKey: CreateApiKeyUseCase,
    private readonly listApiKeys: ListApiKeysUseCase,
    private readonly revokeApiKey: RevokeApiKeyUseCase,
    private readonly config: ConfigService,
  ) {}

  @Get()
  async list(@CurrentUser() user: CurrentUserPayload): Promise<ApiKeyDto[]> {
    const keys = await this.listApiKeys.execute(user.id);
    return keys.map(toApiKeyDto);
  }

  @Post()
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateApiKeyDto,
  ): Promise<CreateApiKeyResponseDto> {
    const created = await this.createApiKey.execute(user.id, dto.label);
    const publicUrl = this.config.getOrThrow<string>('PUBLIC_BASE_URL');
    return {
      id: created.id,
      label: created.label,
      rawKey: created.rawKey,
      mcpUrl: new URL(
        `/api/mcp/garmin/${created.rawKey}`,
        publicUrl,
      ).toString(),
      homeAssistantMcpUrl: new URL(
        `/api/mcp/home-assistant/${created.rawKey}`,
        publicUrl,
      ).toString(),
      createdAt: created.createdAt.toISOString(),
    };
  }

  @Delete(':id')
  @HttpCode(204)
  async revoke(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ): Promise<void> {
    await this.revokeApiKey.execute(user.id, id);
  }
}
