import { Injectable } from '@nestjs/common';
import { Credential } from '../../domain/credential/credential';
import { CredentialRepository } from '../../domain/credential/credential.repository';

@Injectable()
export class ListCredentialsUseCase {
  constructor(private readonly credentialRepository: CredentialRepository) {}

  async execute(userId: string): Promise<Credential[]> {
    return this.credentialRepository.listByUser(userId);
  }
}
