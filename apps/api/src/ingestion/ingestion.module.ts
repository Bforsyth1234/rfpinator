import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { chromaConfig, embeddingConfig, chunkingConfig } from "../config";
import { DocumentParserService } from "./parsers";
import { ChunkingService } from "./chunking.service";
import { EmbeddingService } from "./embedding.service";
import { VectorStoreService } from "./vector-store.service";
import { IngestionService } from "./ingestion.service";
import { IngestionController } from "./ingestion.controller";

@Module({
  imports: [
    ConfigModule.forFeature(chromaConfig),
    ConfigModule.forFeature(embeddingConfig),
    ConfigModule.forFeature(chunkingConfig),
  ],
  controllers: [IngestionController],
  providers: [
    DocumentParserService,
    ChunkingService,
    EmbeddingService,
    VectorStoreService,
    IngestionService,
  ],
  exports: [VectorStoreService, EmbeddingService, IngestionService],
})
export class IngestionModule {}

