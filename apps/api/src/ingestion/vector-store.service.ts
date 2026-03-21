import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigType } from "@nestjs/config";
import { ChromaClient } from "chromadb";
import { v4 as uuidv4 } from "uuid";
import { chromaConfig } from "../config";
import type { TextChunk } from "./chunking.service";
import type { DocumentInfo } from "@rfpinator/shared";

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
   * Remove any existing chunks for a given filename (deduplication).
   */
  async deleteByFilename(filename: string): Promise<number> {
    const existing = await this.collection.get({
      where: { source: filename },
    });

    if (!existing.ids || existing.ids.length === 0) {
      return 0;
    }

    await this.collection.delete({ ids: existing.ids });
    this.logger.log(
      `Deduplicated: removed ${existing.ids.length} existing chunks for "${filename}"`,
    );
    return existing.ids.length;
  }

  /**
   * Store text chunks with their embeddings and citation metadata.
   * Automatically removes any previous chunks for the same filename (upsert behavior).
   */
  async addChunks(
    chunks: TextChunk[],
    embeddings: number[][],
    documentId: string,
    filename: string,
  ): Promise<string[]> {
    // Remove old chunks for this filename to prevent duplicates
    await this.deleteByFilename(filename);

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

  /**
   * List all unique documents in the collection with their chunk counts.
   */
  async listDocuments(): Promise<DocumentInfo[]> {
    const all = await this.collection.get({});
    const docMap = new Map<string, { source: string; count: number }>();

    if (all.metadatas) {
      for (const meta of all.metadatas) {
        if (!meta) continue;
        const docId = String(meta.documentId ?? "unknown");
        const source = String(meta.source ?? "unknown");
        const existing = docMap.get(docId);
        if (existing) {
          existing.count++;
        } else {
          docMap.set(docId, { source, count: 1 });
        }
      }
    }

    return Array.from(docMap.entries()).map(([documentId, info]) => ({
      documentId,
      source: info.source,
      chunkCount: info.count,
    }));
  }

  /**
   * Delete all chunks belonging to a specific document.
   */
  async deleteDocument(documentId: string): Promise<number> {
    // Get all chunk IDs for this document
    const all = await this.collection.get({
      where: { documentId },
    });

    if (!all.ids || all.ids.length === 0) {
      return 0;
    }

    await this.collection.delete({ ids: all.ids });
    this.logger.log(`Deleted ${all.ids.length} chunks for document ${documentId}`);
    return all.ids.length;
  }
}

