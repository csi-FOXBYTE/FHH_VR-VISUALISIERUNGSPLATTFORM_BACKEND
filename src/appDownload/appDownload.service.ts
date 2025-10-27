import { createService } from "@csi-foxbyte/fastify-toab";
import { getConfigurationService } from "../@internals/index.js";

const appDownloadService = createService(
  "appDownload",
  async ({ services }) => {
    const configurationService = await getConfigurationService(services);

    return {
      async getURL() {
        return (await configurationService.getConfiguration())
          .unityDownloadLink;
      },
    };
  }
);

export default appDownloadService;
