import { Hono } from "hono";
import { Bindings, WorkerOverrides } from "./types/bindings";

const app = new Hono<{ Bindings: Bindings }>();

const delay = (ms: number) =>
  new Promise<void>((resolve) =>
    (
      globalThis as unknown as {
        setTimeout: (callback: () => void, timeout?: number) => number;
      }
    ).setTimeout(resolve, ms)
);

app.get("/", (c) => {
  const defaultConfig: Bindings = c.env;
  return c.json(defaultConfig);
});

app.get("/ping", (c) => {
  const start = Date.now();
  return c.json({
    status: "ok",
    timestamp: start,
    uptime: Date.now() - start,
  });
});

app.get("/service", (c) => {
  return c.text(
    `
/service docs
- router worker hits POST /service (url lives in wrangler.jsonc)
- body may include PROCESSING_DELAY_MS | MODE | PERCENTAGE_FAIL to override defaults
- MODE options: "All_Success", "All_fail", "percentage_fail"
- PROCESSING_DELAY_MS simulates latency before we respond
- success responses return "Success" with 200
- failure responses return "Failed" with 500
    `.trim()
  );
});

app.post("/service", async (c) => {
  let mutableConfig: WorkerOverrides = {};
  try {
    mutableConfig = await c.req.json<WorkerOverrides>();
  } catch (error) {
    if ((error as Error).message !== "Unexpected end of JSON input") {
      return c.text("Invalid JSON payload", 400);
    }
  }

  const serviceConfig: Bindings = { ...c.env, ...mutableConfig };
  const processingDelayMs = Math.max(
    0,
    Number(serviceConfig.PROCESSING_DELAY_MS) || 0
  );
  const percentageFail = Math.min(
    100,
    Math.max(0, Number(serviceConfig.PERCENTAGE_FAIL) || 0)
  );

  if (processingDelayMs > 0) {
    // ensure the response is delayed to simulate processing
    await delay(processingDelayMs);
  }

  let hadFailed = false;

  switch (serviceConfig.MODE ?? "All_Success") {
    case "All_fail":
      hadFailed = true;
      break;
    case "percentage_fail":
      hadFailed = Math.random() * 100 < percentageFail;
      break;
    case "All_Success":
      break;
    default:
      return c.text("Invalid mode", 400);
  }

  if (hadFailed) {
    return c.text("Failed", 500);
  }
  return c.text("Success", 200);
});

export default app;
