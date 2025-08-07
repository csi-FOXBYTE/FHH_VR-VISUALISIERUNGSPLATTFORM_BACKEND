import { createMiddleware, GenericRouteError } from "@csi-foxbyte/fastify-toab";
import { getAuthService } from "./auth.service.js";

export const authMiddleware = createMiddleware(
  async ({ ctx, services, request }, next) => {
    const authService = await getAuthService(services);

    console.log({ ad: request.id })

    const session = await authService.getSession();

    if (!session) throw new GenericRouteError("UNAUTHORIZED", "ACCESS_DENIED");

    const newCtx = { ...ctx, session };

    await next({ ctx: newCtx });

    return newCtx;
  }
);
