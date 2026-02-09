
import { createService } from "@csi-foxbyte/fastify-toab";

const testService = createService("test", async () => {
    return {
        helloWorld: () => "Hallo Welt!"
    }
});

export default testService;
