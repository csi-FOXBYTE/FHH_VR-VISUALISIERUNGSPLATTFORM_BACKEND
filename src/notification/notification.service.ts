import { createService } from "@csi-foxbyte/fastify-toab";
import { getEmailService } from "../@internals/index.js";

type Notification = {
  title: string;
  content: string;
  attachments: File[];
  from: string | null;
  to: string;
};

const notificationService = createService(
  "notification",
  async ({ services }) => {
    const emailService = await getEmailService(services);

    async function notify(notifications: Notification[]) {
      for (const notification of notifications) {
        await emailService.sendMail({
          to: notification.to,
          subject: notification.title,
          html: notification.content,
          attachments: await Promise.all(
            notification.attachments.map(async (file) => ({
              cid: crypto.randomUUID(),
              content: Buffer.from(await file.arrayBuffer()),
              contentType: file.type,
              filename: file.name,
            }))
          ),
        });
      }
    }

    return {
      notify,
    };
  }
);

export default notificationService;
