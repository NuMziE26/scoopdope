import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorResponseBody {
  statusCode: number;
  message: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message = this.resolveMessage(exception, statusCode);

    const stack = exception instanceof Error ? exception.stack : undefined;
    this.logger.error(
      `${request.method} ${request.url} -> ${statusCode}: ${message}`,
      stack,
    );

    const body: ErrorResponseBody = { statusCode, message };
    response.status(statusCode).json(body);
  }

  private resolveMessage(exception: unknown, statusCode: number): string {
    if (process.env.NODE_ENV === 'production') {
      return statusCode === HttpStatus.INTERNAL_SERVER_ERROR
        ? 'Internal server error'
        : this.extractHttpMessage(exception);
    }

    if (exception instanceof Error) {
      return exception.message;
    }

    return this.extractHttpMessage(exception);
  }

  private extractHttpMessage(exception: unknown): string {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === 'string') {
        return response;
      }
      if (response && typeof response === 'object' && 'message' in response) {
        const message = (response as { message: unknown }).message;
        if (Array.isArray(message)) {
          return message.join(', ');
        }
        if (typeof message === 'string') {
          return message;
        }
      }
      return exception.message;
    }

    return 'Internal server error';
  }
}
