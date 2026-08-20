import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class StartGarminLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}
