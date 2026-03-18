import "dotenv/config";
import type { TestHelloWorldWorkerJob } from "../../@internals/index.js";
import { initializeContainers } from "../../@internals/registries.js";

export default async function run(
  job: TestHelloWorldWorkerJob
): Promise<TestHelloWorldWorkerJob["returnValue"]> {
  const { services } = await initializeContainers();

  console.log("Hello world!")
}
