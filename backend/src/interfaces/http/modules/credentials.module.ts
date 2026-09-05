import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompleteYoutubeConnectionUseCase } from '../../../application/credentials/complete-youtube-connection.use-case';
import { DeleteCredentialUseCase } from '../../../application/credentials/delete-credential.use-case';
import { ListCookidooLocalizationsUseCase } from '../../../application/credentials/list-cookidoo-localizations.use-case';
import { ListCredentialsUseCase } from '../../../application/credentials/list-credentials.use-case';
import { SaveCookidooConnectionUseCase } from '../../../application/credentials/save-cookidoo-connection.use-case';
import { SaveHomeAssistantConnectionUseCase } from '../../../application/credentials/save-home-assistant-connection.use-case';
import { SaveInstagramConnectionUseCase } from '../../../application/credentials/save-instagram-connection.use-case';
import { SaveLogsConnectionUseCase } from '../../../application/credentials/save-logs-connection.use-case';
import { SavePersonalHealthConnectionUseCase } from '../../../application/credentials/save-personal-health-connection.use-case';
import { StartGarminLoginUseCase } from '../../../application/credentials/start-garmin-login.use-case';
import { StartYoutubeConnectionUseCase } from '../../../application/credentials/start-youtube-connection.use-case';
import { SubmitGarminMfaUseCase } from '../../../application/credentials/submit-garmin-mfa.use-case';
import { CredentialRepository } from '../../../domain/credential/credential.repository';
import { CredentialOrmEntity } from '../../../infrastructure/persistence/entities/credential.orm-entity';
import { TypeOrmCredentialRepository } from '../../../infrastructure/persistence/repositories/typeorm-credential.repository';
import { CredentialsController } from '../controllers/credentials.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CredentialOrmEntity])],
  controllers: [CredentialsController],
  providers: [
    { provide: CredentialRepository, useClass: TypeOrmCredentialRepository },
    ListCredentialsUseCase,
    StartGarminLoginUseCase,
    SubmitGarminMfaUseCase,
    SaveCookidooConnectionUseCase,
    ListCookidooLocalizationsUseCase,
    SaveHomeAssistantConnectionUseCase,
    SaveInstagramConnectionUseCase,
    SaveLogsConnectionUseCase,
    SavePersonalHealthConnectionUseCase,
    StartYoutubeConnectionUseCase,
    CompleteYoutubeConnectionUseCase,
    DeleteCredentialUseCase,
  ],
  exports: [CredentialRepository],
})
export class CredentialsModule {}
