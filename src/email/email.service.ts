import { createService } from "@csi-foxbyte/fastify-toab";
import nodemailer, { type Transporter } from "nodemailer";
import { getConfigurationService } from "../@internals/index.js";

export type EmailParameters = Pick<
  Parameters<ReturnType<typeof nodemailer.createTransport>["sendMail"]>[0],
  "to" | "html" | "attachments" | "subject"
>;

let _transporterHash: string = "";
let _transporter: Transporter | null = null;

async function getTransporter(
  host: string,
  port: number,
  secure: boolean,
  user: string,
  password: string
) {
  if (host === "" || user === "" || password === "") {
    const testAccount = await nodemailer.createTestAccount();
    _transporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });

    return _transporter;
  }

  const rawHash = await crypto.subtle.digest(
    "SHA-256",
    Buffer.from(host + port + secure + user + password)
  );
  const hash = Buffer.from(rawHash).toString("base64");

  if (_transporterHash !== hash || !_transporter) {
    _transporter = nodemailer.createTransport({
      host: host,
      port: port,
      secure: secure,
      auth: {
        user: user,
        pass: password,
      },
    });
    _transporterHash = hash;

    return _transporter;
  } else {
    return _transporter;
  }
}

const emailService = createService("email", async ({ services }) => {
  const configurationService = await getConfigurationService(services);

  return {
    async sendMail(args: EmailParameters) {
      const { emailHost, emailPassword, emailPort, emailSecure, emailUser } =
        await configurationService.getConfiguration();
      const transporter = await getTransporter(
        emailHost,
        emailPort,
        emailSecure,
        emailUser,
        emailPassword
      );

      const info = await transporter.sendMail({
        ...args,
      });

      console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
    },
  };
});

export default emailService;
