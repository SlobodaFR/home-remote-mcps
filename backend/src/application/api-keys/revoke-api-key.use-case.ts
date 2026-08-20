import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApiKeyRepository } from '../../domain/api-key/api-key.repository';

@Injectable()
export class RevokeApiKeyUseCase {
  constructor(private readonly apiKeyRepository: ApiKeyRepository) {}

  async execute(userId: string, apiKeyId: string): Promise<void> {
    const apiKey = await this.apiKeyRepository.findById(apiKeyId);
    if (!apiKey) {
      throw new NotFoundException('API key not found');
    }
    if (apiKey.userId !== userId) {
      throw new ForbiddenException();
    }
    apiKey.revoke(new Date());
    await this.apiKeyRepository.save(apiKey);
  }
}
