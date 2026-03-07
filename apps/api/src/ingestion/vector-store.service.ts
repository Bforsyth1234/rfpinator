import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigType } from "@nestjs/config";
import { ChromaClient } from "chromadb";
import { v4 as uuidv4 } from "uuid";
import { chromaConfig } from "../config";
import type { TextChunk } from "./chunking.service";

type ChromaCollection = Awaited<ReturnType<ChromaClient["getOrCreateCollection"]>>;

@Injectable()
export class VectorStoreService implements OnModuleInit {
  private readonly logger = new Logger(VectorStoreService.name);
  private client!: ChromaClient;
  private collection!: ChromaCollection;

  constructor(
    @Inject(chromaConfig.KEY)
    private readonly config: ConfigType<typeof chromaConfig>,
  ) {}

  async onModuleInit() {
    this.client = new ChromaClient({
      path: `http://${this.config.host}:${this.config.port}`,
    });
    this.collection = await this.client.getOrCreateCollection({
      name: this.config.collection,
    });
    this.logger.log(
      `ChromaDB initialized: collection=${this.config.collection}`,
    );
  }

  /**
   * Store text chunks with their embeddings and citation metadata.
   */
  async addChunks(
    chunks: TextChunk[],
    embeddings: number[][],
    documentId: string,
    filename: string,
  ): Promise<string[]> {
    const ids = chunks.map(() => uuidv4());
    const documents = chunks.map((c) => c.text);
    const metadatas = chunks.map((chunk): Record<string, string | number> => ({
      source: filename,
      pageOrSection: chunk.pageOrSection ?? "",
      chunkIndex: chunk.chunkIndex,
      documentId,
    }));

    await this.collection.add({
      ids,
      documents,
      embeddings,
      metadatas,
    });

    this.logger.debug(`Stored ${ids.length} vectors for document ${documentId}`);
    return ids;
  }

  /**
   * Expose the underlying ChromaDB client for use by the query service.
   */
  getClient(): ChromaClient {
    return this.client;
  }

  /**
   * Expose the collection for use by the query service.
   */
  getCollection(): ChromaCollection {
    return this.collection;
  }

  /**
   * Get the collection name (useful for LlamaIndex integration in query service).
   */
  getCollectionName(): string {
    return this.config.collection;
  }

  /**
   * Get the Chroma connection URL.
   */
  getConnectionUrl(): string {
    return `http://${this.config.host}:${this.config.port}`;
  }
}

