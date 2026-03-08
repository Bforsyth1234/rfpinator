import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import type {
  IngestResponse,
  IngestBatchResponse,
  IngestDirectoryRequest,
  DocumentInfo,
} from "@rfpinator/shared";
import { IngestionService } from "./ingestion.service";
import { VectorStoreService } from "./vector-store.service";

@Controller("ingestion")
export class IngestionController {
  private readonly logger = new Logger(IngestionController.name);

  constructor(
    private readonly ingestionService: IngestionService,
    private readonly vectorStore: VectorStoreService,
  ) {}

  /**
   * POST /ingestion/upload
   * Accept one or more file uploads (multipart/form-data, field name "files").
   */
  @Post("upload")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FilesInterceptor("files", 20))
  async uploadFiles(
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<IngestBatchResponse> {
    this.logger.log(`Upload request: ${files.length} file(s)`);

    const results: IngestResponse[] = [];
    for (const file of files) {
      const result = await this.ingestionService.ingestBuffer(
        file.buffer,
        file.originalname,
        file.mimetype,
      );
      results.push(result);
    }

    const totalChunks = results.reduce((sum, r) => sum + r.chunksCreated, 0);
    return {
      results,
      totalDocuments: results.length,
      totalChunks,
    };
  }

  /**
   * POST /ingestion/directory
   * Ingest all supported files from a directory path on the server.
   */
  @Post("directory")
  @HttpCode(HttpStatus.OK)
  async ingestDirectory(
    @Body() body: IngestDirectoryRequest,
  ): Promise<IngestBatchResponse> {
    this.logger.log(`Directory ingestion request: ${body.directoryPath}`);
    return this.ingestionService.ingestDirectory(
      body.directoryPath,
      body.glob,
    );
  }

  /**
   * POST /ingestion/file
   * Ingest a single file by server-side path.
   */
  @Post("file")
  @HttpCode(HttpStatus.OK)
  async ingestFile(
    @Body() body: { filePath: string },
  ): Promise<IngestResponse> {
    this.logger.log(`File ingestion request: ${body.filePath}`);
    return this.ingestionService.ingestFile(body.filePath);
  }

  /**
   * GET /ingestion/documents
   * List all documents in the vector store.
   */
  @Get("documents")
  async listDocuments(): Promise<{ documents: DocumentInfo[] }> {
    const documents = await this.vectorStore.listDocuments();
    return { documents };
  }

  /**
   * DELETE /ingestion/documents/:id
   * Delete a document and all its chunks from the vector store.
   */
  @Delete("documents/:id")
  async deleteDocument(
    @Param("id") documentId: string,
  ): Promise<{ deleted: number }> {
    this.logger.log(`Delete document request: ${documentId}`);
    const deleted = await this.vectorStore.deleteDocument(documentId);
    return { deleted };
  }
}

