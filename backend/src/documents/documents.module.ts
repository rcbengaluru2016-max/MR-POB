import { Controller, Get, Header, Module, Param, ParseUUIDPipe, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthModule } from '../auth/auth.module';
import { CognitoGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { DatabaseModule } from '../database/prisma.service';
import { ConfigModule } from '../config/config.service';
import { DocumentsService } from './documents.service';
import { S3StorageService } from './s3-storage.service';

@ApiTags('Documents') @ApiBearerAuth() @UseGuards(CognitoGuard)
@Controller('documents')
class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}
  @Get(':id') @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Authorize document access and return a 60-second attachment download URL' })
  @ApiResponse({ status: 200, schema: { type: 'object', properties: { url: { type: 'string' }, expiresIn: { type: 'integer', example: 60 } } } })
  @ApiResponse({ status: 401, description: 'Missing/invalid Cognito access token' })
  @ApiResponse({ status: 403, description: 'Active admin or approved registration owner required' })
  download(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) { return this.documents.download(id, request.user); }
  @Get(':id/preview') @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Authorize document access and return a 60-second inline PDF or image preview URL' })
  @ApiResponse({ status: 200, description: 'Short-lived private inline URL for PDF, JPEG, PNG or WEBP' })
  @ApiResponse({ status: 401, description: 'Missing/invalid Cognito access token' })
  @ApiResponse({ status: 403, description: 'Active admin or approved registration owner required' })
  @ApiResponse({ status: 415, description: 'Unsupported preview type; use the download endpoint' })
  preview(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) { return this.documents.download(id, request.user, true); }
}

@Module({ imports: [AuthModule, DatabaseModule, ConfigModule], controllers: [DocumentsController], providers: [DocumentsService, S3StorageService], exports: [DocumentsService, S3StorageService] })
export class DocumentsModule {}
