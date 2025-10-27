import "dotenv/config";
import { useAzureMonitor } from "@azure/monitor-opentelemetry";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING)
  useAzureMonitor({
    azureMonitorExporterOptions: {
      connectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING!,
    },
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: "backend",
      "service.namespace": "fhhvr",
    }),
    samplingRatio: 1,
    instrumentationOptions: {
      azureSdk: { enabled: true },
      http: { enabled: true },
      redis: { enabled: true },
      redis4: { enabled: true },
    },
  });

await new Promise((r) => setImmediate(r));
