import { BadRequestException, Body, Controller, Delete, Get, Header, Headers, Param, ParseUUIDPipe, Post, Query, Req, Res, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiExtraModels, ApiHeader, ApiOperation, ApiTags, getSchemaPath } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { AdminGuard, AuthenticatedRequest, CognitoGuard } from '../auth/auth.guard';
import { ImportsService } from './imports.service';
import { category } from './import-schema';
import { template, XLSX_TYPE } from './import-workbook';
import { ImportQueryDto } from './imports.dto';
import { ImportCapacityInterceptor, importMemoryStorage } from './import-upload';
import { CompanyRegistrationDto, CustomerRegistrationDto, PatientRegistrationDto } from '../registrations/registration.dto';

const upload = (workbook = false) => AnyFilesInterceptor({ storage: importMemoryStorage, limits: { files: workbook ? 2 : 9, fileSize: (workbook ? 40 : 5) * 1024 * 1024, fields: 40, fieldSize: 4096, parts: workbook ? 6 : 50 } });
@ApiTags('Administrative imports') @ApiBearerAuth()
@ApiExtraModels(CustomerRegistrationDto, CompanyRegistrationDto, PatientRegistrationDto)
@UseGuards(CognitoGuard, AdminGuard)
@UseInterceptors(ImportCapacityInterceptor)
@Throttle({ default: { limit: 20, ttl: 60000 } })
@Controller('imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}
  @Get('templates/:category') @ApiOperation({ summary: 'Download registration DTO based category template' })
  async template(@Param('category') value: string, @Req() req: AuthenticatedRequest, @Res() res: Response) {
    const kind = category(value); const bytes = await template(kind);
    await this.imports.audit(req.user.id, 'TEMPLATE_DOWNLOAD');
    res.type(XLSX_TYPE).attachment(`${kind}-import.xlsx`).send(bytes);
  }
  @Post('bulk/validate') @ApiConsumes('multipart/form-data') @UseInterceptors(upload(true))
  @ApiBody({ schema: { type: 'object', required: ['kind', 'file'], properties: { kind: { type: 'string', enum: ['customer', 'company', 'patient'] }, file: { type: 'string', format: 'binary', description: 'Category XLSX or UTF-8 CSV' }, documentsZip: { type: 'string', format: 'binary', description: 'ZIP of referenced original documents; required for CSV, optional for legacy embedded XLSX' } } } })
  @ApiOperation({ summary: 'Validate up to 250 records; stages documents but creates no registrations' })
  async validate(@Body() body: Record<string, string>, @UploadedFiles() files: Express.Multer.File[], @Req() req: AuthenticatedRequest) {
    try {
      await this.imports.audit(req.user.id, 'VALIDATION_ATTEMPT');
      const kind = category(body.kind || body.category);
      if (Object.keys(body).some(k => !['kind', 'category'].includes(k)) || files.some(f => !['file', 'documentsZip'].includes(f.fieldname))) throw new BadRequestException('Unexpected upload field');
      const workbooks = files.filter(f => f.fieldname === 'file');
      const archives = files.filter(f => f.fieldname === 'documentsZip');
      if (workbooks.length !== 1 || archives.length > 1) throw new BadRequestException('One spreadsheet and at most one Supporting Documents ZIP are required');
      return await this.imports.validate(kind, workbooks[0], archives[0], req.user.id);
    } finally { for (const file of files ?? []) file.buffer.fill(0); }
  }
  @Post('single') @ApiConsumes('multipart/form-data') @UseInterceptors(upload())
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: '16–128 letters, numbers, underscores or hyphens; retain across unchanged retries.' })
  @ApiBody({ schema: { oneOf: [CustomerRegistrationDto, CompanyRegistrationDto, PatientRegistrationDto].map(dto => ({ allOf: [{ $ref: getSchemaPath(dto) }, { type: 'object', required: ['kind', 'masterCode'], properties: { masterCode: { type: 'string', minLength: 1, maxLength: 128, description: 'Original assigned Master Code; preserved exactly, including legacy prefixes' }, kind: { type: 'string', enum: ['customer', 'company', 'patient'] }, ...Object.fromEntries(['dl1', 'dl2', 'dl3', 'gstCertificate', 'shopOutside', 'shopInside', 'companyLogo', 'adminPhoto', 'idProof'].map(key => [key, { type: 'string', format: 'binary' }])) } }] })) } })
  @ApiOperation({ summary: 'Create one approved registration and linked account using the existing registration DTO' })
  async single(@Body() body: Record<string, unknown>, @UploadedFiles() files: Express.Multer.File[], @Headers('idempotency-key') key: string, @Req() req: AuthenticatedRequest) {
    try { await this.imports.audit(req.user.id, 'SINGLE_ATTEMPT'); const { kind, ...fields } = body; return await this.imports.single(category(String(kind)), fields, files, req.user.id, key ?? ''); }
    finally { for (const file of files ?? []) file.buffer.fill(0); }
  }
  @Get() @ApiOperation({ summary: 'Paginated import history, category/status filters and upload-date sorting' })
  list(@Query() query: ImportQueryDto) { return this.imports.list(query); }
  @Get(':id/preview') @Header('Cache-Control', 'private, no-store')
  preview(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest) { return this.imports.preview(id, req.user.id); }
  @Post(':id/confirm') @ApiConsumes('multipart/form-data') @UseInterceptors(upload(true))
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary', description: 'Identical validated spreadsheet; never retained by the backend.' }, documentsZip: { type: 'string', format: 'binary', description: 'Identical ZIP if supplied during validation' } } } })
  @ApiOperation({ summary: 'Resubmit the identical workbook to queue approved registration imports; job ID is the idempotency boundary' })
  async confirm(@Param('id', ParseUUIDPipe) id: string, @UploadedFiles() files: Express.Multer.File[], @Req() req: AuthenticatedRequest) {
    try {
      const spreadsheets = files.filter(file => file.fieldname === 'file');
      const archives = files.filter(file => file.fieldname === 'documentsZip');
      if (spreadsheets.length !== 1 || archives.length > 1 || files.some(file => !['file', 'documentsZip'].includes(file.fieldname))) throw new BadRequestException('Resubmit the identical spreadsheet and supporting ZIP');
      return await this.imports.confirm(id, spreadsheets[0], req.user.id, archives[0]);
    }
    finally { for (const file of files ?? []) file.buffer.fill(0); }
  }
  @Get(':id/progress') progress(@Param('id', ParseUUIDPipe) id: string) { return this.imports.detail(id); }
  @Get(':id/errors') @Header('Cache-Control', 'private, no-store')
  async errors(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest, @Res() res: Response) { res.type(XLSX_TYPE).attachment(`import-${id}-errors.xlsx`).send(await this.imports.download(id, req.user.id)); }
  @Get(':id/download') @Header('Cache-Control', 'private, no-store')
  async download(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest, @Res() res: Response) { res.type(XLSX_TYPE).attachment(`import-${id}-sanitised.xlsx`).send(await this.imports.download(id, req.user.id)); }
  @Get(':id') detail(@Param('id', ParseUUIDPipe) id: string) { return this.imports.detail(id); }
  @Delete(':id') remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest) { return this.imports.remove(id, req.user.id); }
}
