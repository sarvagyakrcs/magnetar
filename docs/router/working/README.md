# Magnetar Router Frontend Integration

This guide explains how dashboard or frontend clients should interact with the deployed router (`https://magnetar-router.chiefsarvagya.workers.dev/service`) to run experiments, collect metrics, and orchestrate worker fleets.

## Architecture Snapshot
- The router is a Cloudflare Worker (Hono app) that accepts every incoming route, chooses a downstream worker URL, forwards the request, and returns the downstream response unchanged except for a couple of diagnostic headers.
- Worker selection depends on the requested algorithm, Upstash Redis state, and the static worker list in `router/src/constants.ts`.
- The downstream workers expose `/service` and can simulate latency or failures when you pass override fields in the JSON body. See the deployed service doc for the full contract ([source](https://magnetar-router.chiefsarvagya.workers.dev/service)).

## Base URL & Required Endpoint
- Router origin: `https://magnetar-router.chiefsarvagya.workers.dev`.
- All product traffic and experiments should target `POST https://magnetar-router.chiefsarvagya.workers.dev/service`. The router matches `app.all("*")`, so additional paths are technically valid, but `/service` is the standardized contract shared with every worker.

### Sample request
```shell
curl -X POST https://magnetar-router.chiefsarvagya.workers.dev/service \
  -H 'content-type: application/json' \
  -H 'x-magnetar-algo: random' \
  -d '{
    "PROCESSING_DELAY_MS": 200,
    "MODE": "percentage_fail",
    "PERCENTAGE_FAIL": 35
  }'
```
- `algo` can also be set inside the JSON body (see precedence below). The worker-specific overrides (`PROCESSING_DELAY_MS`, `MODE`, `PERCENTAGE_FAIL`, etc.) will be forwarded downstream untouched.

## Request Contract
- **Body**: JSON is expected for interactive scenarios. The router parses the JSON, removes the optional `algo` field, and forwards the rest of the payload (if any) as JSON to the selected worker.
- **Headers**:
  - `x-magnetar-algo` – optional algorithm hint.
  - Custom experiment headers can be added; everything except `content-length` is forwarded downstream automatically.
- **Query Parameters**: `?algo=` is another way to select an algorithm.
- **Other methods**: Non-JSON bodies (form-data, etc.) are streamed as-is to the worker.

### Algorithm precedence
The router chooses the algorithm via the following order (`router/src/index.ts`):

```31:68:router/src/index.ts
  const algo = bodyAlgo ?? getRequestedAlgo(c)
```

`getRequestedAlgo` checks `?algo=` first, then the `x-magnetar-algo` header, finally falls back to `roundRobin`:

```16:25:router/src/index.ts
const getRequestedAlgo = (c: MagnetarContext) => {
  const queryParam = c.req.query('algo')
  if (isAlgo(queryParam)) return queryParam
  const headerValue = c.req.header('x-magnetar-algo')
  if (isAlgo(headerValue)) return headerValue
  return DEFAULT_ALGO
}
```

The `algo` field defined in the JSON schema matches the same set of values:

```1:12:router/src/types/body.d.ts
export type BodyType = WorkerOverrides & {
    algo?: 'roundRobin' | 'random' | 'proprietry'
}
```

## Supported Algorithms

| Algorithm | Behavior | Notes |
| --- | --- | --- |
| `roundRobin` | Persists the last index in Upstash Redis (`roundRobin` key) and cycles through every worker URL sequentially. | State mutation happens via `redis.get/set`; see `router/src/help.ts`. |
| `random` | Picks a random worker each request using `Math.random`. | No Redis dependency. |
| `proprietry` | Always returns the third entry in `avalibleWorkers`. | Placeholder for custom logic; update when proprietary logic exists. |

The helper that wires algorithms to worker URLs is below:

```1:41:router/src/help.ts
const getWorkerUrl = async (algo: BodyType['algo'], redis: Redis): Promise<string> => {
  switch (algo) {
    case 'roundRobin':
      return getRoundRobinWorker(redis)
    case 'random':
      return getRandomWorker()
    case 'proprietry':
      return avalibleWorkers[2]
  }
  return ''
}
```

The worker pool is currently hard-coded:

```1:4:router/src/constants.ts
export const avalibleWorkers = [
  'https://worker.apshabd.workers.dev/',
  'https://worker2.apshabd.workers.dev',
  'https://worker3.apshabd.workers.dev'
]
```
Update this list whenever you deploy new worker instances, and redeploy the router so the dashboard reflects the new pool.

## Worker Runtime Overrides
Each worker merges override fields into its environment before responding (`worker/src/index.ts`). Relevant fields:

| Field | Type | Description |
| --- | --- | --- |
| `PROCESSING_DELAY_MS` | number | Adds an artificial delay before the worker responds to simulate latency. |
| `MODE` | `"All_Success"`, `"All_fail"`, `"percentage_fail"` | Dictates whether the worker always succeeds, always fails, or randomly fails. |
| `PERCENTAGE_FAIL` | number `0-100` | Used only when `MODE=percentage_fail`. |

Reference implementation for `/service` behavior:

```29:86:worker/src/index.ts
app.post('/service', async (c) => {
  let mutableConfig = await c.req.json<WorkerOverrides>() // graceful empty-body handling
  const serviceConfig = { ...c.env, ...mutableConfig }
  await delay(processingDelayMs)
  switch (serviceConfig.MODE ?? 'All_Success') {
    case 'All_fail': return c.text('Failed', 500)
    case 'percentage_fail': hadFailed = Math.random() * 100 < percentageFail
  }
  return hadFailed ? c.text('Failed', 500) : c.text('Success', 200)
})
```

For friendly, human-readable docs, hit the deployed `GET /service` endpoint ([source](https://magnetar-router.chiefsarvagya.workers.dev/service)).

## Response Contract & Metrics Hooks
- **Status code**: Whatever the downstream worker responded with (200 for `Success`, 500 for `Failed`, 4xx when payload validation fails).
- **Body**: Proxy of the worker body.
- **Router-added headers**:
  - `x-magnetar-worker-url`: The actual worker that ran your request. Use it to plot per-worker health.
  - `x-algo-used`: Confirms the algorithm the router resolved after applying precedence rules.

Example snippet:

```31:97:router/src/index.ts
  const responseHeaders = new Headers(response.headers)
  responseHeaders.set('x-magnetar-worker-url', workerUrl)
  responseHeaders.set('x-algo-used', algo)
  return new Response(response.body, { status: response.status, headers: responseHeaders })
```

### Dashboard Ideas
1. **Worker Utilization**: Count requests per `x-magnetar-worker-url` grouped by algorithm to ensure distribution behaves as expected.
2. **Success/Failure Heatmap**: Plot status code vs worker to detect hotspots (e.g., `percentage_fail` experiments).
3. **Latency Tracking**: Measure client-side RTT plus read `PROCESSING_DELAY_MS` overrides from experiment metadata to validate the synthetic delay.
4. **Algorithm Comparison**: Display success rate and latency per algorithm to validate new routing strategies before promoting them.
5. **Config Audit Trail**: Store the JSON payload used for each run so you can replay or roll back experiments.

## Running Controlled Experiments
1. Choose an algorithm (body, header, or query string).
2. Craft a JSON payload with overrides (`MODE`, `PROCESSING_DELAY_MS`, `PERCENTAGE_FAIL`) to mimic the scenario you want to visualize.
3. Send repeated requests while the dashboard observes headers + status codes.
4. Flip between algorithms to compare behavior in real time.

### Example experiment matrix
| Experiment | Algo | Overrides | Expected outcome |
| --- | --- | --- | --- |
| Latency shakeout | `roundRobin` | `PROCESSING_DELAY_MS=500` | Uniform 500 ms delay from every worker. |
| Burst failure | `random` | `MODE=All_fail` | All requests fail, helps verify alerting. |
| Canary | `proprietry` | `MODE=percentage_fail`, `PERCENTAGE_FAIL=15` | Route all traffic to worker index 2 and watch failure rate hover near 15%. |

## Troubleshooting
- **`{ error: "No worker url found" }`**: All worker URLs are missing/empty. Update `router/src/constants.ts` and redeploy.
- **`{ error: "Failed to forward request" }`** with status 502: Router could not reach the worker URL (DNS/outage). Check `x-magnetar-worker-url`.
- **Invalid JSON payload**: Make sure `content-type: application/json` is set and payload is valid JSON. Empty bodies are allowed.
- **Redis issues (round robin)**: If Upstash Redis is unavailable, the router will default back to index 0 by resetting the stored pointer.

## Next Steps for Frontend Teams
1. Wire the dashboard’s API client to the POST route described above.
2. Persist the payload, algorithm choice, response status, and router-specific headers for every run to power analytics views.
3. Offer UI controls for:
   - Selecting algorithm (`roundRobin`, `random`, `proprietry`).
   - Tuning `PROCESSING_DELAY_MS`, `MODE`, `PERCENTAGE_FAIL`.
   - Scheduling repeated runs / load bursts.
4. Build charts/tables on top of the stored telemetry to visualize worker health and routing efficacy.

With this contract, frontend operators can confidently orchestrate experiments and monitor routing quality without touching the router’s underlying Cloudflare Worker.

