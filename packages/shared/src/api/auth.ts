import { z } from "zod";
import {
  userDisplayNameSchema,
  userEmailSchema,
  userRoleSchema,
  userSchema,
} from "../user";

export const AUTH_PASSWORD_MIN_LENGTH = 12;
export const AUTH_PASSWORD_MAX_BYTES = 72;
export const AUTH_ACCESS_TOKEN_TYPE = "Bearer";
export const AUTH_REFRESH_TOKEN_BYTES = 32;
export const AUTH_REFRESH_TOKEN_LENGTH = 43;

/**
 * AUTH-002が発行し、AUTH-004のGuardが検証するHS256アクセストークンのpayload。
 * 標準claimの追加余地は残しつつ、認証に使うclaimは必須かつ型安全に検証する。
 */
export const accessTokenPayloadSchema = z
  .object({
    sub: z.string().uuid(),
    role: userRoleSchema,
    iat: z.number().int().nonnegative(),
    exp: z.number().int().positive(),
  })
  .passthrough();

export type AccessTokenPayload = z.infer<typeof accessTokenPayloadSchema>;

/** Guardが検証後にHTTP requestへ設定する、公開可能な最小の認証情報。 */
export const authenticatedUserSchema = z
  .object({
    id: z.string().uuid(),
    role: userRoleSchema,
  })
  .strict();

export type AuthenticatedUser = z.infer<typeof authenticatedUserSchema>;

function utf8ByteLength(value: string): number {
  let length = 0;

  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x7f) {
      length += 1;
    } else if (codePoint <= 0x7ff) {
      length += 2;
    } else if (codePoint <= 0xffff) {
      length += 3;
    } else {
      length += 4;
    }
  }

  return length;
}

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || codePoint === 0x7f) {
      return true;
    }
  }

  return false;
}

/**
 * bcryptの72バイト上限を超えず、英字と数字を含むパスワード。
 * passwordは意味のある空白を変えないためtrim・大小文字変換を行わない。
 */
export const authPasswordSchema = z
  .string({ required_error: "パスワードは必須です" })
  .min(AUTH_PASSWORD_MIN_LENGTH, `パスワードは${AUTH_PASSWORD_MIN_LENGTH}文字以上必要です`)
  .regex(/[A-Za-z]/, "パスワードには英字を1文字以上含めてください")
  .regex(/[0-9]/, "パスワードには数字を1文字以上含めてください")
  .refine((password) => !containsControlCharacter(password), "パスワードに制御文字は使用できません")
  .refine(
    (password) => utf8ByteLength(password) <= AUTH_PASSWORD_MAX_BYTES,
    `パスワードはUTF-8で${AUTH_PASSWORD_MAX_BYTES}バイト以下にしてください`,
  );

export const registerRequestSchema = z
  .object({
    email: userEmailSchema,
    password: authPasswordSchema,
    displayName: userDisplayNameSchema,
  })
  .strict();

export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z
  .object({
    email: userEmailSchema,
    password: authPasswordSchema,
  })
  .strict();

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const refreshTokenSchema = z
  .string({ required_error: "リフレッシュトークンは必須です" })
  .length(AUTH_REFRESH_TOKEN_LENGTH, "リフレッシュトークンの形式が正しくありません")
  .regex(/^[A-Za-z0-9_-]+$/u, "リフレッシュトークンの形式が正しくありません");

export const refreshRequestSchema = z
  .object({
    refreshToken: refreshTokenSchema,
  })
  .strict();

export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

export const authResponseSchema = z
  .object({
    accessToken: z.string().regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u),
    tokenType: z.literal(AUTH_ACCESS_TOKEN_TYPE),
    expiresIn: z.number().int().positive(),
    refreshToken: refreshTokenSchema,
    refreshExpiresIn: z.number().int().positive(),
    user: userSchema,
  })
  .strict();

export type AuthResponse = z.infer<typeof authResponseSchema>;

export const registerResponseSchema = authResponseSchema;
export type RegisterResponse = z.infer<typeof registerResponseSchema>;

export const loginResponseSchema = authResponseSchema;
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const refreshResponseSchema = authResponseSchema;
export type RefreshResponse = z.infer<typeof refreshResponseSchema>;
