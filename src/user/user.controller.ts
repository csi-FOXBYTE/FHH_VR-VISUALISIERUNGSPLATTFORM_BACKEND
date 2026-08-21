import { createController } from "@csi-foxbyte/fastify-toab";
import { authMiddleware } from "../auth/auth.middleware.js";
import { Type } from "@sinclair/typebox";
import { getUserService } from "../@internals/index.js";
import {
  ownershipEntityTypeDTO,
  ownershipImpactDTO,
  ownershipPreflightDTO,
  ownershipSuccessorsDTO,
} from "./user.dto.js";

const userController = createController().use(authMiddleware).rootPath("/user");

userController
  .addRoute("GET", "/info")
  .output(
    Type.Object({
      name: Type.String(),
      email: Type.String(),
      image: Type.Union([Type.String(), Type.Null()]),
    }),
  )
  .handler(async ({ services, ctx }) => {
    const userService = await getUserService(services);
    return userService.info(ctx.session.user.id);
  });

userController
  .addRoute("GET", "/ownership-preflight")
  .output(ownershipPreflightDTO)
  .handler(async ({ services }) => {
    const userService = await getUserService(services);
    return userService.getOwnershipPreflight();
  });

userController
  .addRoute("POST", "/repair-orphaned-ownership")
  .body(ownershipSuccessorsDTO)
  .output(
    Type.Object({
      correlationId: Type.String(),
      repaired: Type.Object({
        PROJECT: Type.Integer({ minimum: 0 }),
        BASE_LAYER: Type.Integer({ minimum: 0 }),
        VISUAL_AXIS: Type.Integer({ minimum: 0 }),
        EVENT: Type.Integer({ minimum: 0 }),
      }),
    }),
  )
  .handler(async ({ services, body }) => {
    const userService = await getUserService(services);
    return userService.repairOrphanedOwnership(body);
  });

userController
  .addRoute("GET", "/ownership-successors")
  .querystring(Type.Object({ type: ownershipEntityTypeDTO }))
  .output(
    Type.Array(
      Type.Object({
        id: Type.String(),
        name: Type.Union([Type.String(), Type.Null()]),
        email: Type.String(),
      }),
    ),
  )
  .handler(async ({ querystring, services }) => {
    const userService = await getUserService(services);
    return userService.getOwnershipSuccessors(querystring.type);
  });

userController
  .addRoute("GET", "/:id/deletion-impact")
  .params(Type.Object({ id: Type.String() }))
  .output(ownershipImpactDTO)
  .handler(async ({ params, services }) => {
    const userService = await getUserService(services);
    return userService.getDeletionImpact(params.id);
  });

userController
  .addRoute("GET", "/:id/deletion-successors")
  .params(Type.Object({ id: Type.String() }))
  .querystring(Type.Object({ type: ownershipEntityTypeDTO }))
  .output(
    Type.Array(
      Type.Object({
        id: Type.String(),
        name: Type.Union([Type.String(), Type.Null()]),
        email: Type.String(),
      }),
    ),
  )
  .handler(async ({ params, querystring, services }) => {
    const userService = await getUserService(services);
    return userService.getDeletionSuccessors(params.id, querystring.type);
  });

userController
  .addRoute("POST", "/:id/transfer-and-delete")
  .params(Type.Object({ id: Type.String() }))
  .body(ownershipSuccessorsDTO)
  .output(
    Type.Object({
      correlationId: Type.String(),
      impact: ownershipImpactDTO,
    }),
  )
  .handler(async ({ params, body, services }) => {
    const userService = await getUserService(services);
    return userService.transferAndDelete(params.id, body);
  });

userController
  .addRoute("DELETE", "/")
  .output(Type.Boolean())
  .handler(async ({ ctx, services }) => {
    const userService = await getUserService(services);
    await userService.deleteSelf(ctx.session.user.id);
    return true;
  });

export default userController;
