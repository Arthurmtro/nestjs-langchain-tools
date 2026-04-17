import {
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  classValidatorToJsonSchema,
  validateAndTransform,
  ToolInputValidationError,
} from './index';

enum Priority {
  LOW = 'low',
  HIGH = 'high',
}

class Address {
  @IsString()
  street!: string;

  @IsString()
  @IsOptional()
  city?: string;
}

class CreateTicketDto {
  @IsString()
  @MinLength(3)
  title!: string;

  @IsInt()
  @Min(1)
  @Max(10)
  severity!: number;

  @IsEnum(Priority)
  priority!: Priority;

  @IsEmail()
  @IsOptional()
  reporter?: string;

  @IsArray()
  @IsString({ each: true })
  tags!: string[];

  @ValidateNested()
  @Type(() => Address)
  address!: Address;
}

describe('classValidatorToJsonSchema', () => {
  it('produces an object schema with required/optional fields correctly split', () => {
    const schema = classValidatorToJsonSchema(CreateTicketDto);
    expect(schema.type).toBe('object');
    expect(schema.properties).toBeDefined();
    expect(schema.required).toContain('title');
    expect(schema.required).toContain('severity');
    expect(schema.required).toContain('priority');
    expect(schema.required).not.toContain('reporter');
  });

  it('maps constraints to JSON Schema fields', () => {
    const schema = classValidatorToJsonSchema(CreateTicketDto);
    const title = schema.properties!.title;
    expect(title.type).toBe('string');
    expect(title.minLength).toBe(3);

    const severity = schema.properties!.severity;
    expect(severity.type).toBe('integer');
    expect(severity.minimum).toBe(1);
    expect(severity.maximum).toBe(10);

    const reporter = schema.properties!.reporter;
    expect(reporter.format).toBe('email');

    const priority = schema.properties!.priority;
    expect(priority.enum).toEqual(expect.arrayContaining(['low', 'high']));
  });

  it('resolves nested DTOs via @Type() metadata', () => {
    const schema = classValidatorToJsonSchema(CreateTicketDto);
    const address = schema.properties!.address;
    expect(address.type).toBe('object');
    expect(address.properties?.street.type).toBe('string');
  });
});

describe('validateAndTransform', () => {
  it('returns a typed instance on valid input', async () => {
    const input = {
      title: 'boom',
      severity: 5,
      priority: Priority.HIGH,
      tags: ['a'],
      address: { street: '1 rue' },
    };
    const out = await validateAndTransform(CreateTicketDto, input);
    expect(out).toBeInstanceOf(CreateTicketDto);
    expect(out.address).toBeInstanceOf(Address);
  });

  it('throws ToolInputValidationError with per-field issues on failure', async () => {
    try {
      await validateAndTransform(CreateTicketDto, {
        title: 'x',
        severity: 999,
        priority: 'nope',
        tags: ['a'],
        address: { street: 'road' },
      });
      fail('expected validation error');
    } catch (err) {
      expect(err).toBeInstanceOf(ToolInputValidationError);
      const msg = (err as ToolInputValidationError).message;
      expect(msg).toContain('title');
      expect(msg).toContain('severity');
      expect(msg).toContain('priority');
    }
  });
});
