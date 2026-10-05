import { proxyRequest } from "@/lib/server/backend-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path: string[] }> };
async function forward(request: Request, context: Context): Promise<Response> {
  return proxyRequest(request, (await context.params).path);
}

export { forward as GET, forward as POST, forward as PATCH, forward as DELETE };
