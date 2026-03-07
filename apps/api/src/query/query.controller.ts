import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
} from "@nestjs/common";
import type { RagQueryRequest, RagQueryResponse } from "@rfpinator/shared";
import { QueryService } from "./query.service";

@Controller("query")
export class QueryController {
  private readonly logger = new Logger(QueryController.name);

  constructor(private readonly queryService: QueryService) {}

  /**
   * POST /query
   * Accept a question and optional model_choice, return structured RAG answer.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async query(@Body() body: RagQueryRequest): Promise<RagQueryResponse> {
    this.logger.log(
      `Query request: model_choice=${body.model_choice ?? "default"}, question="${body.question?.slice(0, 80)}"`,
    );
    return this.queryService.query(body);
  }

  /**
   * GET /query/providers
   * Return available LLM provider names for the frontend dropdown.
   */
  @Get("providers")
  getProviders(): { providers: string[] } {
    return { providers: this.queryService.getAvailableProviders() };
  }
}

