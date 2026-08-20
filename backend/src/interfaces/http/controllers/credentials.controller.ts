import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { DeleteCredentialUseCase } from '../../../application/credentials/delete-credential.use-case';
import { ListCredentialsUseCase } from '../../../application/credentials/list-credentials.use-case';
import {
  StartGarminLoginResult,
  StartGarminLoginUseCase,
} from '../../../application/credentials/start-garmin-login.use-case';
import {
  SubmitGarminMfaResult,
  SubmitGarminMfaUseCase,
} from '../../../application/credentials/submit-garmin-mfa.use-case';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../decorators/current-user.decorator';
import { StartGarminLoginDto } from '../dto/start-garmin-login.dto';
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
    private readonly deleteCredential: DeleteCredentialUseCase,
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

  @Delete(':id')
  @HttpCode(204)
  async delete(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ): Promise<void> {
    await this.deleteCredential.execute(user.id, id);
  }
}
