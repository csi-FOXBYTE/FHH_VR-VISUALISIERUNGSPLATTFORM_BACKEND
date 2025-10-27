import { createController } from "@csi-foxbyte/fastify-toab";
import { Type } from "@sinclair/typebox";
import { getAppDownloadService } from "../@internals/index.js";
import { authMiddleware } from "../auth/auth.middleware.js";

const appDownloadController = createController()
  .use(authMiddleware)
  .rootPath("/appDownload");

appDownloadController
  .addRoute("GET", "/link")
  .output(Type.String())
  .handler(async ({ services }) => {
    const appDownloadService = await getAppDownloadService(services);

    return await appDownloadService.getURL();
  });

export default appDownloadController;
