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