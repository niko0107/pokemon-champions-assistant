import { Module } from "@nestjs/common";
import { EXPLANATION_GENERATOR } from "./explanation-generator";
import { TemplateExplanationGenerator } from "./template-explanation-generator";

@Module({
  providers: [
    TemplateExplanationGenerator,
    {
      provide: EXPLANATION_GENERATOR,
      useExisting: TemplateExplanationGenerator,
    },
  ],
  exports: [EXPLANATION_GENERATOR],
})
export class ExplanationsModule {}
