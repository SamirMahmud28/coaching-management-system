import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { getRewrittenUrl, isRewrite } from "next/experimental/testing/server";
import { routeRequest } from "./proxy";

const config = { baseDomain: "localhost:3000", platformHost: "admin.localhost:3000" };

function request(host: string, path: string) {
  return new NextRequest(`http://${host}${path}`, { headers: { host } });
}

const passesThrough = (res: Response) => res.headers.get("x-middleware-next") === "1";

describe("proxy routing", () => {
  describe("platform host", () => {
    it("rewrites pages into the platform app", () => {
      const res = routeRequest(request("admin.localhost:3000", "/institutes?status=ACTIVE"), config);
      expect(isRewrite(res)).toBe(true);
      expect(getRewrittenUrl(res)).toBe("http://admin.localhost:3000/platform/institutes?status=ACTIVE");
      expect(getRewrittenUrl(routeRequest(request("admin.localhost:3000", "/"), config))).toBe("http://admin.localhost:3000/platform");
    });

    it("serves the platform API but refuses institute APIs", async () => {
      expect(passesThrough(routeRequest(request("admin.localhost:3000", "/api/platform/tenants"), config))).toBe(true);
      const res = routeRequest(request("admin.localhost:3000", "/api/v1/students"), config);
      expect(res.status).toBe(404);
      expect((await res.json()).error.code).toBe("NOT_FOUND_RESOURCE");
    });

    it("never serves institute routes by their internal path", () => {
      expect(routeRequest(request("admin.localhost:3000", "/institute/login"), config).status).toBe(404);
    });
  });

  describe("institute subdomain (D19)", () => {
    it("serves the public page at /, sign-in at /login and the app under /app", () => {
      expect(getRewrittenUrl(routeRequest(request("demo.localhost:3000", "/"), config))).toBe("http://demo.localhost:3000/institute");
      expect(getRewrittenUrl(routeRequest(request("demo.localhost:3000", "/login?next=%2Fapp"), config))).toBe(
        "http://demo.localhost:3000/institute/login?next=%2Fapp",
      );
      expect(getRewrittenUrl(routeRequest(request("demo.localhost:3000", "/app/students"), config))).toBe(
        "http://demo.localhost:3000/institute/app/students",
      );
    });

    it("serves institute APIs", () => {
      expect(passesThrough(routeRequest(request("demo.localhost:3000", "/api/v1/students"), config))).toBe(true);
      expect(passesThrough(routeRequest(request("demo.localhost:3000", "/api/auth/tenant/sign-in"), config))).toBe(true);
    });

    it("never serves platform routes, or institute routes by their internal path", () => {
      expect(routeRequest(request("demo.localhost:3000", "/platform/institutes"), config).status).toBe(404);
      expect(routeRequest(request("demo.localhost:3000", "/api/platform/tenants"), config).status).toBe(404);
      expect(routeRequest(request("demo.localhost:3000", "/institute/login"), config).status).toBe(404);
    });
  });

  describe("bare domain", () => {
    it("serves the product site but no app routes", () => {
      expect(passesThrough(routeRequest(request("localhost:3000", "/"), config))).toBe(true);
      expect(routeRequest(request("localhost:3000", "/api/v1/students"), config).status).toBe(404);
      expect(routeRequest(request("localhost:3000", "/platform"), config).status).toBe(404);
      expect(routeRequest(request("localhost:3000", "/institute"), config).status).toBe(404);
    });
  });

  describe("unknown host", () => {
    it("shows the generic Institute not found page, which never confirms whether an institute exists", () => {
      const res = routeRequest(request("www.localhost:3000", "/login"), config);
      expect(getRewrittenUrl(res)).toBe("http://www.localhost:3000/institute-not-found");
    });

    it("returns a JSON 404 for API calls", () => {
      expect(routeRequest(request("evil.example.com", "/api/v1/students"), config).status).toBe(404);
    });
  });
});
