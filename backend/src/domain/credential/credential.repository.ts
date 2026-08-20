import { Credential } from './credential';

/** Port (driven side) implemented by the infrastructure layer. */
export abstract class CredentialRepository {
  abstract findById(id: string): Promise<Credential | null>;
  abstract findByUserAndService(
    userId: string,
    service: string,
  ): Promise<Credential | null>;
  abstract listByUser(userId: string): Promise<Credential[]>;
  abstract save(credential: Credential): Promise<void>;
  abstract delete(id: string): Promise<void>;
}
