import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { IngestionModule } from "./ingestion/ingestion.module";
import { QueryModule } from "./query/query.module";
import { EvaluationModule } from "./evaluation/evaluation.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    IngestionModule,
    QueryModule,
    EvaluationModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

