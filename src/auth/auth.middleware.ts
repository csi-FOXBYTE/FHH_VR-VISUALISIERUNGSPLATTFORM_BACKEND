import { createMiddleware, GenericRouteError } from "@csi-foxbyte/fastify-toab";
import { getAuthService } from "../@internals/index.js";

export const authMiddleware = createMiddleware(
  async ({ ctx, services }, next) => {
    const authService = await getAuthService(services);

    const session = await authService.getSession();

    if (!session) throw new GenericRouteError("UNAUTHORIZED", "ACCESS_DENIED");

    const newCtx = { ...ctx, session };

    await next({ ctx: newCtx });

    return newCtx;
  }
);
