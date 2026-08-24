import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function contextFor(role: "super_admin" | "admin" | "user"): TrpcContext {
  return {
    user: {
      id: 7,
      openId: `${role}-user`,
      email: `${role}@example.com`,
      name: role,
      loginMethod: "manus",
      role,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

describe("LMS role boundaries", () => {
  it("blocks learners from the Admin review queue before querying the database", async () => {
    const caller = appRouter.createCaller(contextFor("user"));
    await expect(caller.review.queue({})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks Admin from Super Admin user management before querying the database", async () => {
    const caller = appRouter.createCaller(contextFor("admin"));
    await expect(caller.users.list({})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks inactive users from all protected routes", async () => {
    const ctx = contextFor("user");
    ctx.user = { ...ctx.user!, isActive: false };
    const caller = appRouter.createCaller(ctx);
    await expect(caller.notifications.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
