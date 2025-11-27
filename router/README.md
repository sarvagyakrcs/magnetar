## Router

- Router for the Magnetar project.
- Responsibilities:
  - accepts any request on `/` and forwards it to one of the configured workers;
  - fetches worker URLs from `config/workers.json` (no manual copy/paste);
  - applies round-robin/random/proprietary selection based on headers/body overrides;
    - `proprietry` mode calls the learner service (`LEARNER_URL`) which runs Thompson Sampling on Kafka telemetry to choose the worker dynamically;
  - forwards the downstream response back to the caller;
  - emits routing telemetry for every request to the Kafka REST proxy on the `telemetry` topic (fire-and-forget via `waitUntil`).
- Router url : https://magnetar-router.chiefsarvagya.workers.dev

### Running Thompson Sampling (Proprietary Algo)

1. **Bring up Kafka + REST proxy**
   ```bash
   cd kafka
   docker compose up -d
   ```
   The compose file exposes `localhost:29092` for host clients and `http://localhost:8082` for REST.

2. **Start the learner**
   ```bash
   cd learner
   go run .
   # optional overrides:
   # LEARNER_KAFKA_BROKERS=localhost:29092 LEARNER_HTTP_ADDR=:8091 go run .
   ```
   The learner consumes the `telemetry` topic, keeps Beta posteriors per worker, and serves `/recommendation`, `/stats`, and `/healthz`.

3. **Configure the router**
   - `wrangler.jsonc` already sets `LEARNER_URL` to `http://localhost:8090` for local dev.
   - Deploy/preview the router (`wrangler dev`/`wrangler deploy`).
   - Send traffic with `algo=proprietry` (JSON body field, `?algo=proprietry`, or `x-magnetar-algo` header).

4. **Observe the improvement**
   - Round-robin distributes evenly, so with the sample worker profile (two workers at `100%` failure, one at `20%`) you get ~27% success.
   - Proprietary + learner converges on the good worker, yielding ~80% success at ~58 req/s (see `test-bed` screenshots).

If the learner is offline, proprietary requests fall back to random selection so traffic still flows. As soon as telemetry resumes, Thompson Sampling takes over automatically.

### Telemetry

Every request produces a concise record that the learner service can consume for MAB strategies. Fields:

| Field              | Description                                                                 |
| ------------------ | --------------------------------------------------------------------------- |
| `version`          | Schema version (currently `1`).                                             |
| `telemetryId`      | UUID used as Kafka record key.                                              |
| `capturedAt`       | ISO timestamp when the router produced the record.                         |
| `context`          | `{ requestId, method, path, query?, clientId?, hasRequestBody, payloadBytes? }`. |
| `decision`         | `{ algo, workerUrl, targetUrl, workerCount }`.                              |
| `outcome`          | `{ statusCode, latencyMs, success }`; success auto-derived from status code. |
| `reward`           | Scalar reward (defaults to `1` on success, `0` otherwise).                  |

Records are logged via `console.log("routingTelemetry", record)` during development and then published to Kafka. Learner services should subscribe to the `telemetry` topic and process these entries to train contextual bandits or any other adaptive routing logic.