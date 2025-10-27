import { createController } from "@csi-foxbyte/fastify-toab";
import { Type } from "@sinclair/typebox";
import { getBaseLayerService } from "../@internals/index.js";
import { $Enums } from "@prisma/client";
import { authMiddleware } from "../auth/auth.middleware.js";

const baseLayerController = createController()
  .use(authMiddleware)
  .rootPath("/baseLayer");

baseLayerController
  .addRoute("DELETE", "/:id")
  .params(
    Type.Object({
      id: Type.String(),
    })
  )
  .handler(async ({ params, services }) => {
    const baseLayerService = await getBaseLayerService(services);

    await baseLayerService.delete(params.id);
  });

baseLayerController
  .addRoute("PUT", "/")
  .body(
    Type.Object({
      href: Type.String(),
      name: Type.String(),
      type: Type.Enum($Enums.LAYER_TYPE),
    })
  )
  .handler(async ({ body, services }) => {
    const baseLayerService = await getBaseLayerService(services);

    await baseLayerService.add(body.href, body.name, body.type);
  });

baseLayerController
  .addRoute("PATCH", "/")
  .body(
    Type.Object({
      href: Type.Union([Type.String(), Type.Null()]),
      visibleForGroups: Type.Array(Type.String()),
      id: Type.String(),
      isPublic: Type.Boolean(),
    })
  )
  .handler(async ({ body, services }) => {
    const baseLayerService = await getBaseLayerService(services);

    await baseLayerService.update(body.id, body.href, body.visibleForGroups, body.isPublic);
  });

baseLayerController
  .addRoute("POST", "/listChanges")
  .body(
    Type.Object({
      timestamp: Type.Number({
        description:
          "This is a unix timestamp, which is defined as the midnight at the beginning of January 1, 1970, UTC.",
      }),
    })
  )
  .output(
    Type.Array(
      Type.Object({
        id: Type.String(),
        name: Type.String(),
        href: Type.String(),
        type: Type.String(),
        description: Type.String(),
      })
    )
  )
  .handler(async ({ services, body }) => {
    const baseLayerService = await getBaseLayerService(services);

    return await baseLayerService.listChanges(body.timestamp);
  });

baseLayerController
  .addRoute("GET", "/list")
  .output(
    Type.Array(
      Type.Object({
        id: Type.String(),
        name: Type.String(),
        href: Type.String(),
        type: Type.String(),
        description: Type.String(),
      })
    )
  )
  .handler(async ({ services }) => {
    const baseLayerService = await getBaseLayerService(services);

    return await baseLayerService.list();
  });

export default baseLayerController;
