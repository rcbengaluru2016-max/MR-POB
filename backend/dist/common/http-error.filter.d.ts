import { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
export declare class HttpErrorFilter implements ExceptionFilter {
    private readonly logger;
    catch(error: unknown, host: ArgumentsHost): void;
}
