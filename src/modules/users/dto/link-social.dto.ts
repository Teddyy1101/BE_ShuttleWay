import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LinkSocialDto {
  @ApiProperty({ description: 'ID Token từ Firebase Authentication (Google/Facebook)' })
  @IsString()
  @IsNotEmpty()
  idToken: string;
}
