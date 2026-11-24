import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  ValidationPipe as NestValidationPipe,
  ValidationPipeOptions,
} from '@nestjs/common';
import { ValidationError } from 'class-validator';

/**
 * Flattens class-validator errors into a map of field -> messages so that
 * clients receive the offending field name instead of a raw DB error.
 */
function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): Record<string, string[]> {
  const result: Record<string, string[]> = {};

  for (const error of errors) {
    const path = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;

    if (error.constraints) {
      result[path] = Object.values(error.constraints);
    }

    if (error.children && error.children.length > 0) {
      Object.assign(result, flattenValidationErrors(error.children, path));
    }
  }

  return result;
}

/**
 * Global validation pipe. Rejects unknown properties and returns clean 400
 * responses that include the offending field names.
 */
@Injectable()
export class ValidationPipe extends NestValidationPipe {
  constructor(options: ValidationPipeOptions = {}) {
    super({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      ...options,
      exceptionFactory: (errors: ValidationError[]) =>
        new BadRequestException({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Validation failed',
          fields: flattenValidationErrors(errors),
        }),
    });
  }

  async transform(value: unknown, metadata: ArgumentMetadata): Promise<unknown> {
    return super.transform(value, metadata);
  }
}
