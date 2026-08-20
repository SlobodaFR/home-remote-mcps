import { Injectable } from '@nestjs/common';
import { ApiKey } from '../../domain/api-key/api-key';
import { ApiKeyRepository } from '../../domain/api-key/api-key.repository';

@Injectable()
export class ListApiKeysUseCase {
  constructor(private readonly apiKeyRepository: ApiKeyRepository) {}

  async execute(userId: string): Promise<ApiKey[]> {
    return this.apiKeyRepository.listByUser(userId);
  }
}
