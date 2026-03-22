import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID, Validate, ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments } from 'class-validator';

@ValidatorConstraint({ name: 'isAfterOrEqual', async: false })
class IsAfterOrEqualConstraint implements ValidatorConstraintInterface {
  validate(toDate: string, args: ValidationArguments) {
    const obj = args.object as CreateLeaveRequestDto;
    if (!obj.fromDate || !toDate) return true;
    return new Date(toDate) >= new Date(obj.fromDate);
  }

  defaultMessage() {
    return 'Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu';
  }
}

export class CreateLeaveRequestDto {
  @ApiProperty({ description: 'ID học sinh', example: 'uuid-student' })
  @IsUUID('4', { message: 'ID học sinh không hợp lệ' })
  @IsNotEmpty({ message: 'ID học sinh không được để trống' })
  studentId: string;

  @ApiProperty({ description: 'ID phụ huynh', example: 'uuid-parent' })
  @IsUUID('4', { message: 'ID phụ huynh không hợp lệ' })
  @IsNotEmpty({ message: 'ID phụ huynh không được để trống' })
  parentId: string;

  @ApiProperty({ description: 'Ngày bắt đầu nghỉ', example: '2026-03-25' })
  @IsDateString({}, { message: 'Ngày bắt đầu không hợp lệ' })
  @IsNotEmpty({ message: 'Ngày bắt đầu không được để trống' })
  fromDate: string;

  @ApiProperty({ description: 'Ngày kết thúc nghỉ', example: '2026-03-27' })
  @IsDateString({}, { message: 'Ngày kết thúc không hợp lệ' })
  @IsNotEmpty({ message: 'Ngày kết thúc không được để trống' })
  @Validate(IsAfterOrEqualConstraint)
  toDate: string;

  @ApiPropertyOptional({ description: 'Lý do xin nghỉ', example: 'Bị ốm' })
  @IsString({ message: 'Lý do phải là chuỗi ký tự' })
  @IsOptional()
  reason?: string;
}
