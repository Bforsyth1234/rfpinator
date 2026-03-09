import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigType } from "@nestjs/config";
import { SentenceSplitter } from "llamaindex";
import { chunkingConfig } from "../config";
import type { DocumentSegment } from "./parsers";

export interface TextChunk {
  /** The chunk text */
  text: string;
  /** Page or section from the source segment */
  pageOrSection?: string;
  /** 0-based index of this chunk within the document */
  chunkIndex: number;
}

@Injectable()
export class ChunkingService {
  private readonly logger = new Logger(ChunkingService.name);
  private readonly splitter: SentenceSplitter;

  constructor(
    @Inject(chunkingConfig.KEY)
    private readonly config: ConfigType<typeof chunkingConfig>,
  ) {
    this.splitter = new SentenceSplitter({
      chunkSize: config.chunkSize,
      chunkOverlap: config.chunkOverlap,
    });
    this.logger.log(
      `Chunking configured: size=${config.chunkSize}, overlap=${config.chunkOverlap}`,
    );
  }

  /**
   * Chunk document segments into overlapping text chunks.
   * Each segment is chunked independently to preserve section boundaries.
   */
  chunkSegments(segments: DocumentSegment[]): TextChunk[] {
    const chunks: TextChunk[] = [];
    let globalIndex = 0;

    for (const segment of segments) {
      if (!segment.text.trim()) continue;

      const splits = this.splitter.splitText(segment.text);

      for (const splitText of splits) {
        chunks.push({
          text: splitText,
          pageOrSection: segment.pageOrSection,
          chunkIndex: globalIndex++,
        });
      }
    }

    this.logger.debug(
      `Chunked ${segments.length} segments into ${chunks.length} chunks`,
    );
    return chunks;
  }

  /**
   * Chunk a single text string (convenience method).
   */
  chunkText(text: string): TextChunk[] {
    return this.chunkSegments([{ text }]);
  }
}

