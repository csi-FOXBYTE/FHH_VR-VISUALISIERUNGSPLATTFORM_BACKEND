import { pino } from "pino";

export const loggerOptions = {
  transport: {
    target: "pino-pretty",
    options: {
      translateTime: "HH:MM:ss Z",
      ignore: "pid,hostname",
    },
  },
};

export function injectPinoLogger() {
  const pinoLogger = pino(loggerOptions);

  console.log = pinoLogger.info.bind(pinoLogger);
  console.info = pinoLogger.info.bind(pinoLogger);
  console.warn = pinoLogger.warn.bind(pinoLogger);
  console.error = pinoLogger.error.bind(pinoLogger);
  console.debug = pinoLogger.debug.bind(pinoLogger);
}
