import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { groqConfig, queryConfig, embeddingConfig } from "../config";
import { IngestionModule } from "../ingestion/ingestion.module";
import { GroqProvider } from "./providers/groq.provider";
import { OpenAiProvider } from "./providers/openai.provider";
import { QueryService } from "./query.service";
import { QueryController } from "./query.controller";

@Module({
  imports: [
    ConfigModule.forFeature(groqConfig),
    ConfigModule.forFeature(queryConfig),
    ConfigModule.forFeature(embeddingConfig),
    IngestionModule,
  ],
  controllers: [QueryController],
  providers: [GroqProvider, OpenAiProvider, QueryService],
  exports: [QueryService],
})
export class QueryModule {}

