import { ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter';

describe('GlobalExceptionFilter', () => {
  const originalEnv = process.env.NODE_ENV;

  const createHost = () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ url: '/test' }),
      }),
    } as unknown as ArgumentsHost;
    return { host, status, json };
  };

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    jest.restoreAllMocks();
  });

  it('returns only statusCode and message in production without a stack trace', () => {
    process.env.NODE_ENV = 'production';
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const filter = new GlobalExceptionFilter();
    const { host, status, json } = createHost();
    const exception = new Error('secret internal detail');

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    const body = json.mock.calls[0][0];
    expect(body).toEqual({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    });
    expect(body).not.toHaveProperty('stack');
    expect(JSON.stringify(body)).not.toContain('secret internal detail');
  });

  it('does not include a stack trace in the response body in development', () => {
    process.env.NODE_ENV = 'development';
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const filter = new GlobalExceptionFilter();
    const { host, status, json } = createHost();
    const exception = new Error('dev failure');

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    const body = json.mock.calls[0][0];
    expect(body).not.toHaveProperty('stack');
    expect(JSON.stringify(body)).not.toContain('dev failure');
    expect(errorSpy).toHaveBeenCalled();
  });

  it('preserves HttpException status and message', () => {
    process.env.NODE_ENV = 'production';
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const filter = new GlobalExceptionFilter();
    const { host, status, json } = createHost();
    const exception = new HttpException('Not found', HttpStatus.NOT_FOUND);

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(json).toHaveBeenCalledWith({
      statusCode: HttpStatus.NOT_FOUND,
      message: 'Not found',
    });
  });
});
