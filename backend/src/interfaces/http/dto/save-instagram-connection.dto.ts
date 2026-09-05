import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class SaveInstagramConnectionDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9_.]{1,64}$/, {
    message:
      'accountName must be 1-64 characters, letters/digits/dots/underscores only',
  })
  accountName!: string;

  @IsString()
  @IsNotEmpty()
  accessToken!: string;
}
