/**
 * Simple Kafka REST Proxy producer test for the `failures` topic.
 *
 * Usage:
 *   KAFKA_HTTP_BRIDGE_URL=http://localhost:8082 bun test/index.ts
 * Environment variables (optional):
 *   - KAFKA_HTTP_BRIDGE_URL: Base URL of the Kafka REST Proxy.
 *   - KAFKA_TOPIC: Topic name (defaults to "failures").
 */
const bridgeBaseUrl =
  process.env.KAFKA_HTTP_BRIDGE_URL ?? "https://myles-ethylenic-mauro.ngrok-free.dev";
const topic = process.env.KAFKA_TOPIC ?? "failures";

const record = {
  key: `test-${Date.now()}`,
  value: {
    testId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    source: "bun-http-bridge-check",
  },
};

const payload = { records: [record] };

async function main() {
  const endpoint = `${bridgeBaseUrl}/topics/${topic}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/vnd.kafka.v2+json",
      "Content-Type": "application/vnd.kafka.json.v2+json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`Kafka REST proxy returned ${response.status}: ${errorBody}`);
    process.exit(1);
  }

  const result = await response.json();
  console.log("Message produced:", result);
}

main().catch((err) => {
  console.error("Failed to produce message via HTTP bridge:", err);
  process.exit(1);
});