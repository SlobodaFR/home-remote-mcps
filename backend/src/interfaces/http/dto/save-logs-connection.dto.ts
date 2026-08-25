import { IsNotEmpty, IsString } from 'class-validator';

export class SaveLogsConnectionDto {
  @IsString()
  @IsNotEmpty()
  basePath!: string;
}
