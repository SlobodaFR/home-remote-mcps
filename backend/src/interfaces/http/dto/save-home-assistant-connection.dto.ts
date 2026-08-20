import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

export class SaveHomeAssistantConnectionDto {
  @IsUrl({ require_tld: false, protocols: ['http', 'https'] })
  baseUrl!: string;

  @IsString()
  @IsNotEmpty()
  token!: string;
}
