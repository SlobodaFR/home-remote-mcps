import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class SaveOpenAiConnectionDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9_.]{1,64}$/, {
    message:
      'name must be 1-64 characters, letters/digits/dots/underscores only',
  })
  name!: string;

  @IsString()
  @IsNotEmpty()
  apiKey!: string;

  @IsString()
  @IsOptional()
  organization?: string;
}
