import { ContextService, Get, Service } from "@tganzhorn/fastify-modular";
import { Metrics } from "bullmq";

@Service([ContextService])
export class StatsService {
  constructor(private contextService: ContextService) {}

  async getJobStats() {
    const response: Record<
      string,
      {
        active: number;
        completedMetrics: Metrics;
        failedMetrics: Metrics;
      }
    > = {};

    for (const [queueName, queue] of this.contextService.ctx.queues.entries()) {
      response[queueName] = {
        active: await queue.getActiveCount(),
        completedMetrics: await queue.getMetrics("completed"),
        failedMetrics: await queue.getMetrics("completed"),
      };
    }

    return response;
  }
}
