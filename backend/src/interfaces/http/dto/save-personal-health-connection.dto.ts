import { IsNotEmpty, IsString } from 'class-validator';

export class SavePersonalHealthConnectionDto {
  @IsString()
  @IsNotEmpty()
  apiKey!: string;
}
