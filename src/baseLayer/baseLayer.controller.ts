import { createController } from "@csi-foxbyte/fastify-toab";
import { Type } from "@sinclair/typebox";
import { getBaseLayerService } from "../@internals/index.js";
import { $Enums } from "@prisma/client";

const baseLayerController = createController().rootPath("/baseLayer");

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

export default baseLayerController;
