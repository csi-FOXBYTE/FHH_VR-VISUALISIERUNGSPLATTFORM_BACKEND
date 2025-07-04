import { Service } from "@tganzhorn/fastify-modular";
import { enhance, Enhanced } from "@zenstackhq/runtime";
import { prisma } from "../prisma/index.js";
import { AuthService } from "../auth/auth.service.js";

@Service([AuthService])
export class DbService {
  subscriberClient: typeof prisma;

  constructor(private authService: AuthService) {
    this.subscriberClient = prisma;
  }

  get client() {
    return new Promise<Enhanced<typeof prisma>>(async (resolve, reject) => {
      try {
        const session = await this.authService.getSession();

        resolve(enhance(prisma, session));
      } catch (e) {
        return reject(e);
      }
    });
  }
}
