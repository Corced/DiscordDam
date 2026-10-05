// ASSUMPTION: jwtService export shape + signAccessToken(payload, opts) signature.
import { jwtService } from "../../src/services/jwtService.js";

export interface MockAccessPayload {
  sub: string;
  type: "access";
  role: "MEMBER";
  jti?: string;
  [key: string]: unknown;
}

export function createMockAccessToken(
  payload: Partial<MockAccessPayload> = {},
  opts?: Record<string, unknown>,
): string {
  const finalPayload = {
    sub: "123456789012345678",
    type: "access",
    ...payload,
    role: "MEMBER", // forced last — this factory can never mint ADMIN (constraint under test)
  };
  return jwtService.signAccessToken(finalPayload, opts);
}