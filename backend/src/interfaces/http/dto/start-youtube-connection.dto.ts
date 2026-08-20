import { IsNotEmpty, IsString } from 'class-validator';

export class StartYoutubeConnectionDto {
  @IsString()
  @IsNotEmpty()
  clientId!: string;

  @IsString()
  @IsNotEmpty()
  clientSecret!: string;
}
