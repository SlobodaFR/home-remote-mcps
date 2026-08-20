import { IsNotEmpty, IsString } from 'class-validator';

export class SubmitGarminMfaDto {
  @IsString()
  @IsNotEmpty()
  pendingId!: string;

  @IsString()
  @IsNotEmpty()
  code!: string;
}
