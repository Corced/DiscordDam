import { randomUUID } from "node:crypto";

// Test-local structural type — swap for your real User type if you prefer compiler-enforced drift.
export interface MockUser {
  id: string;
  discordId: string;
  username: string;
  role: "MEMBER" | "REVOKED";
  status: "ACTIVE" | "REVOKED";
}

let seq = 0;

export function createMockUser(overrides: Partial<MockUser> = {}): MockUser {
  seq += 1;
  return {
    id: randomUUID(),
    discordId: `test-user-${seq}`,
    username: `testuser${seq}`,
    role: "MEMBER",
    status: "ACTIVE",
    ...overrides,
  };
}