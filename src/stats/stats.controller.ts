import { Controller, Get } from "@tganzhorn/fastify-modular";
import { StatsService } from "./stats.service.js";

@Controller("/stats", [StatsService])
export class StatsController {
  constructor(private statsService: StatsService) {}

  @Get("/job-stats")
  async getJobStats() {
    return this.statsService.getJobStats();
  }
}
