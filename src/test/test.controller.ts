import { createController } from "@csi-foxbyte/fastify-toab";
import { Type } from "@sinclair/typebox";
import { getTestService } from "../@internals/index.js";

const testController = createController().rootPath("/test");

testController
  .addRoute("POST", "/doSomething")
  .body(Type.Object({ b: Type.Boolean() }))
  .output(Type.Object({ a: Type.String() }))
  .handler(async ({ body, services }) => {
    const testService = await getTestService(services);

    return { a: testService.helloWorld() };
  })

export default testController;
