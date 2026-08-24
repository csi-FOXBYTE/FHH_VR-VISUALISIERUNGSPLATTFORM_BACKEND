import {
  genericRouteErrorHandler,
  type FastifyToabRouteErrorHandler,
} from "@csi-foxbyte/fastify-toab";
import { OwnershipConflictError } from "./ownership.js";

export const ownershipRouteErrorHandler: FastifyToabRouteErrorHandler = (
  context,
) => {
  if (context.error instanceof OwnershipConflictError) {
    context.reply
      .code(context.error.statusCode)
      .send(context.error.toJSON());
    return;
  }
  return genericRouteErrorHandler(context);
};
