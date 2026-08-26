import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class SaveCookidooConnectionDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;

  @IsString()
  @IsNotEmpty()
  countryCode!: string;

  @IsString()
  @IsNotEmpty()
  language!: string;
}
