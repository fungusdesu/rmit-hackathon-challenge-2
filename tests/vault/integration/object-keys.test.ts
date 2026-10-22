import { describe, expect, it } from "vitest";
import { createOrg, createUser, prisma, skipIT, uploadDoc } from "../helpers/fixtures";

describe.skipIf(skipIT)("object keys", () => {
  it("are unique, v1/<43 base64url chars>, and contain no org/user ids", async () => {
    const u = await createUser("keys");
    const org = await createOrg(u);
    for (let i = 0; i < 6; i++) await uploadDoc(u, org);
    const docs = await prisma.document.findMany({ where: { organizationId: org }, select: { objectKey: true } });
    expect(docs.length).toBe(6);
    const keys = docs.map((d) => d.objectKey);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) {
      expect(k).toMatch(/^v1\/[A-Za-z0-9_-]{43}$/);
      expect(k).not.toContain(org); expect(k).not.toContain(u.id); expect(k).not.toContain(u.subject);
    }
  });
});
