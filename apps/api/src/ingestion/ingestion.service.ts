import { Injectable, Logger } from "@nestjs/common";
import { v4 as uuidv4 } from "uuid";
import * as fs from "fs/promises";
import * as path from "path";
import type {
  IngestResponse,
  IngestBatchResponse,
} from "@rfpinator/shared";
import { DocumentParserService } from "./parsers";
import { ChunkingService } from "./chunking.service";
import { EmbeddingService } from "./embedding.service";
import { VectorStoreService } from "./vector-store.service";

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly parser: DocumentParserService,
    private readonly chunker: ChunkingService,
    private readonly embedder: EmbeddingService,
    private readonly vectorStore: VectorStoreService,
  ) {}

  /**
   * Ingest a single file from disk.
   */
  async ingestFile(filePath: string): Promise<IngestResponse> {
    const documentId = uuidv4();
    try {
      this.logger.log(`Ingesting file: ${filePath}`);
      const parsed = await this.parser.parseFile(filePath);
      const chunks = this.chunker.chunkSegments(parsed.segments);

      if (chunks.length === 0) {
        return {
          documentId,
          chunksCreated: 0,
          status: "success",
          message: "No content to ingest",
        };
      }

      const embeddings = await this.embedder.embedTexts(
        chunks.map((c) => c.text),
      );
      await this.vectorStore.addChunks(
        chunks,
        embeddings,
        documentId,
        parsed.filename,
      );

      this.logger.log(
        `Ingested ${parsed.filename}: ${chunks.length} chunks stored`,
      );
      return {
        documentId,
        chunksCreated: chunks.length,
        status: "success",
      };
    } catch (error: any) {
      this.logger.error(`Failed to ingest ${filePath}: ${error.message}`);
      return {
        documentId,
        chunksCreated: 0,
        status: "error",
        message: error.message,
      };
    }
  }

  /**
   * Ingest an uploaded file buffer.
   */
  async ingestBuffer(
    buffer: Buffer,
    filename: string,
    mimeType?: string,
  ): Promise<IngestResponse> {
    const documentId = uuidv4();
    try {
      this.logger.log(`Ingesting upload: ${filename}`);
      const parsed = await this.parser.parseBuffer(buffer, filename, mimeType);
      const chunks = this.chunker.chunkSegments(parsed.segments);

      if (chunks.length === 0) {
        return {
          documentId,
          chunksCreated: 0,
          status: "success",
          message: "No content to ingest",
        };
      }

      const embeddings = await this.embedder.embedTexts(
        chunks.map((c) => c.text),
      );
      await this.vectorStore.addChunks(
        chunks,
        embeddings,
        documentId,
        parsed.filename,
      );

      this.logger.log(
        `Ingested upload ${filename}: ${chunks.length} chunks stored`,
      );
      return {
        documentId,
        chunksCreated: chunks.length,
        status: "success",
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to ingest upload ${filename}: ${error.message}`,
      );
      return {
        documentId,
        chunksCreated: 0,
        status: "error",
        message: error.message,
      };
    }
  }

  /**
   * Ingest all supported files from a directory.
   */
  async ingestDirectory(
    directoryPath: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    glob?: string,
  ): Promise<IngestBatchResponse> {
    const supportedExts = this.parser.getSupportedExtensions();
    const entries = await fs.readdir(directoryPath, { withFileTypes: true });

    const files = entries
      .filter((e) => e.isFile())
      .filter((e) => {
        const ext = path.extname(e.name).toLowerCase();
        return supportedExts.includes(ext);
      })
      .map((e) => path.join(directoryPath, e.name));

    this.logger.log(
      `Directory ingestion: found ${files.length} supported files in ${directoryPath}`,
    );

    const results: IngestResponse[] = [];
    for (const file of files) {
      const result = await this.ingestFile(file);
      results.push(result);
    }

    const totalChunks = results.reduce((sum, r) => sum + r.chunksCreated, 0);
    return {
      results,
      totalDocuments: results.length,
      totalChunks,
    };
  }
}

