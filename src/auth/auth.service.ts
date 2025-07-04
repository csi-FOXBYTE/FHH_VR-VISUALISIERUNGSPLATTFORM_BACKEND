import {
  ContextService,
  RequestStore,
  Service,
} from "@tganzhorn/fastify-modular";
import { prisma } from "../prisma/index.js";
import { authOptions } from "./authOptions.js";
import { getSession } from "./index.js";

@Service([ContextService])
export class AuthService extends RequestStore<{
  session: Awaited<{
    user: {
      id: string;
      email: string;
      name: string | null;
      assignedGroups: {
        assignedRoles: {
          assignedPermissions: { name: string; id: string }[];
        }[];
      }[];
    };
  }> | null;
}> {
  constructor(private contextService: ContextService) {
    super({ session: null });
  }

  async getSession() {
    if (!this.requestStore.session) {
      const rawSession = await getSession(
        this.contextService.ctx.request,
        authOptions
      );

      this.requestStore.session = {
        user: await prisma.user.findFirstOrThrow({
          where: {
            email: rawSession?.user.email,
          },
          select: {
            id: true,
            email: true,
            name: true,
            assignedGroups: {
              select: {
                assignedRoles: {
                  select: {
                    assignedPermissions: {
                      select: {
                        name: true,
                        id: true,
                      },
                    },
                  },
                },
              },
            },
          },
        }),
      };
    }

    return this.requestStore.session!;
  }
}
