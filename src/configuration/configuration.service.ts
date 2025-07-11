import { ContextService, Service } from "@tganzhorn/fastify-modular";
import { DbService } from "../db/db.service.js";

@Service([DbService])
export class ConfigurationService extends ContextService {
  constructor(private dbService: DbService) {
    super();
  }

  async getConfiguration() {
    return await this.ctx.cache.wrap(
      "__config__",
      async () => {
        return await this.dbService.subscriberClient.configuration.findFirstOrThrow(
          {
            select: {
              defaultEPSG: true,
              globalStartPointX: true,
              globalStartPointY: true,
              globalStartPointZ: true,
              invitationEmailText: true,
              localProcessorFolder: true,
              maxParallelBaseLayerConversions: true,
              maxParallelFileConversions: true,
            },
          }
        );
      },
      300_000
    ); // hold in cache for 5 minutes
  }
}
