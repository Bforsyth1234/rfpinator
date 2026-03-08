import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigType } from "@nestjs/config";
import { OpenAIEmbedding } from "llamaindex";
import { embeddingConfig } from "../config";

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly embedModel: OpenAIEmbedding;

  constructor(
    @Inject(embeddingConfig.KEY)
    config: ConfigType<typeof embeddingConfig>,
  ) {
    this.embedModel = new OpenAIEmbedding({
      model: config.model as any,
      apiKey: config.apiKey || undefined,
    });
    this.logger.log(`Embedding model: ${config.model}`);
  }

  /**
   * Generate embeddings for a batch of text chunks.
   */
  async embedTexts(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    texts.forEach((text, index) => {
      this.validateText(text, `Embedding text at index ${index}`);
    });
    this.logger.debug(`Generating embeddings for ${texts.length} chunks`);
    return this.embedModel.getTextEmbeddings(texts);
  }

  /**
   * Generate embedding for a single text.
   */
  async embedText(text: string): Promise<number[]> {
    this.validateText(text, "Embedding text");
    return this.embedModel.getTextEmbedding(text);
  }

  /**
   * Expose the underlying embedding model for use with LlamaIndex pipelines.
   */
  getModel(): OpenAIEmbedding {
    return this.embedModel;
  }

  private validateText(text: unknown, label: string): void {
    if (typeof text !== "string" || !text.trim()) {
      throw new BadRequestException(`${label} must be a non-empty string.`);
    }
  }
}

