import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CredentialRepository } from '../../domain/credential/credential.repository';

@Injectable()
export class DeleteCredentialUseCase {
  constructor(private readonly credentialRepository: CredentialRepository) {}

  async execute(userId: string, credentialId: string): Promise<void> {
    const credential = await this.credentialRepository.findById(credentialId);
    if (!credential) {
      throw new NotFoundException('Credential not found');
    }
    if (credential.userId !== userId) {
      throw new ForbiddenException();
    }
    await this.credentialRepository.delete(credentialId);
  }
}
