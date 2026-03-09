import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { embeddingConfig } from "../config";
import { QueryModule } from "../query/query.module";
import { EvaluationController } from "./evaluation.controller";
import { EvaluationService } from "./evaluation.service";
import { JudgeService } from "./judge.service";

@Module({
  imports: [
    ConfigModule.forFeature(embeddingConfig),
    QueryModule,
  ],
  controllers: [EvaluationController],
  providers: [EvaluationService, JudgeService],
  exports: [EvaluationService],
})
export class EvaluationModule {}

