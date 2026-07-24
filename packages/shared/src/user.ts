import { z } from "zod";
import { USER_ROLES } from "./enums";

export const USER_EMAIL_MAX_LENGTH = 254;
export const USER_DISPLAY_NAME_MAX_LENGTH = 50;
export const USER_PASSWORD_HASH_MAX_LENGTH = 255;

export const userRoleSchema = z.enum(USER_ROLES);

/**
 * users.emailへ保存する正規形。
 * AUTH-002は本スキーマを通し、前後空白を除去して小文字化した値だけを永続化する。
 */
export const userEmailSchema = z
  .string()
  .trim()
  .min(1, "メールアドレスは必須です")
  .max(USER_EMAIL_MAX_LENGTH, `メールアドレスは${USER_EMAIL_MAX_LENGTH}文字以下にしてください`)
  .email("メールアドレスの形式が正しくありません")
  .transform((email) => email.toLowerCase());

/** 表示時の大文字小文字は維持し、前後空白だけを除去する。 */
export const userDisplayNameSchema = z
  .string()
  .trim()
  .min(1, "表示名は1文字以上必要です")
  .max(
    USER_DISPLAY_NAME_MAX_LENGTH,
    `表示名は${USER_DISPLAY_NAME_MAX_LENGTH}文字以下にしてください`,
  );

/**
 * クライアントと共有してよいユーザー情報。
 * passwordHashを含めないstrictな契約とし、認証情報の誤露出を防ぐ。
 */
export const userSchema = z
  .object({
    id: z.string().uuid(),
    email: userEmailSchema,
    displayName: userDisplayNameSchema,
    role: userRoleSchema,
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type User = z.infer<typeof userSchema>;
