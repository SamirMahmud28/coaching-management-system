import { NextResponse, type NextRequest } from "next/server";
import { NotFoundError, toErrorResponse } from "./server/core/errors";
import { classifyHost, hostConfigFromEnv, type HostConfig } from "./server/core/tenancy/host";

/**
 * Host-based routing only, not a security boundary: every route handler re-derives the tenant and checks the
 * session itself. Institute hosts serve the public page at "/", sign-in at "/login" and the app under "/app".
 */
export function proxy(request: NextRequest) {
  return routeRequest(request, hostConfigFromEnv());
}

export const PLATFORM_TREE = "/platform";
export const INSTITUTE_TREE = "/institute";

export function routeRequest(request: NextRequest, config: HostConfig): NextResponse {
  const host = classifyHost(request.headers.get("host"), config);
  const { pathname, search } = request.nextUrl;

  const under = (prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);
  const isApi = pathname.startsWith("/api/");
  const isPlatformApi = under("/api/platform");
  // App route trees are only reachable through the host rewrites below, never by their internal path.
  const isInternalPage = under(PLATFORM_TREE) || under(INSTITUTE_TREE) || under("/institute-not-found");
  const rewriteInto = (prefix: string) =>
    NextResponse.rewrite(new URL(`${prefix}${pathname === "/" ? "" : pathname}${search}`, request.url));

  switch (host.kind) {
    case "platform":
      if (isPlatformApi) return NextResponse.next();
      if (isApi || isInternalPage) return notFound(isApi);
      return rewriteInto(PLATFORM_TREE);

    case "tenant":
      if (isPlatformApi || isInternalPage) return notFound(isPlatformApi);
      if (isApi) return NextResponse.next();
      return rewriteInto(INSTITUTE_TREE);

    case "root":
      // The bare domain is the product site: no tenant context, so no app routes.
      if (isApi || isInternalPage) return notFound(isApi);
      return NextResponse.next();

    case "unknown":
      if (isApi) return notFound(true);
      return NextResponse.rewrite(new URL("/institute-not-found", request.url));
  }
}

function notFound(asJson: boolean): NextResponse {
  if (asJson) {
    const { status, body } = toErrorResponse(new NotFoundError("resource"));
    return NextResponse.json(body, { status });
  }
  return new NextResponse("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.jpg|apple-icon.jpg|brand/|images/).*)"],
};
