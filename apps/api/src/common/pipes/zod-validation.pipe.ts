import { BadRequestException, Injectable, type PipeTransform } from "@nestjs/common";
import type { ProblemDetails } from "@pokemon-champions/shared";
import type { ZodSchema } from "zod";

/**
 * リクエストボディ/クエリを zod スキーマで検証する Pipe。
 * 検証エラーは RFC 9457 (Problem Details) 形式で 400 を返す(設計書 §10.1)。
 *
 * 使用例:
 *   @Post()
 *   create(@Body(new ZodValidationPipe(createSessionSchema)) dto: CreateSessionDto) {}
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) {
      return result.data;
    }
    const problem: ProblemDetails = {
      type: "about:blank",
      title: "Validation Failed",
      status: 400,
      code: "VALIDATION_ERROR",
      errors: result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    };
    throw new BadRequestException(problem);
  }
}
