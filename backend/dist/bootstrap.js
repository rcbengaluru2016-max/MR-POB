"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureApp = configureApp;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const node_crypto_1 = require("node:crypto");
const helmet_1 = __importDefault(require("helmet"));
const http_error_filter_1 = require("./common/http-error.filter");
function configureApp(app, swagger = false) {
    app.setGlobalPrefix('api');
    app.use((0, helmet_1.default)());
    app.use((req, res, next) => {
        const started = Date.now();
        res.setHeader('X-Request-ID', (0, node_crypto_1.randomUUID)());
        res.setHeader('Cache-Control', 'no-store');
        res.on('finish', () => common_1.Logger.log(JSON.stringify({ event: 'http_request', requestId: res.getHeader('X-Request-ID'), method: req.method, status: res.statusCode, durationMs: Date.now() - started }), 'HTTP'));
        next();
    });
    app.useGlobalPipes(new common_1.ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true, validationError: { target: false, value: false } }));
    app.useGlobalFilters(new http_error_filter_1.HttpErrorFilter());
    if (swagger) {
        const config = new swagger_1.DocumentBuilder().setTitle('Zenex Registration API').setDescription('Registration requests, private documents and administrator read access. Public submission never creates or activates an ERP account.').setVersion('1.0').addBearerAuth().build();
        const document = swagger_1.SwaggerModule.createDocument(app, config);
        // Swagger initialization includes an inline script. Relax CSP for documentation only.
        app.use('/api/docs', (_req, res, next) => { res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"); next(); });
        swagger_1.SwaggerModule.setup('api/docs', app, document);
    }
}
//# sourceMappingURL=bootstrap.js.map