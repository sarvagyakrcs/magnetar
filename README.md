# Magnetar

(not an acronym)

This is SLaB 2.0 and I am calling it Magnetar. SLaB 1.0 was very close to being a viable MVP but it couldn't. Now I am trying again with a refined architecture—hope it succeeds.

## Architecture Evolution

Current first draft vs. where we landed (old on the left, new on the right):

<div style="display:flex; gap:16px; flex-wrap:wrap;">
  <img src="./docs/images/basic-first-draft.png" alt="initial sketch" width="420" />
  <img src="./docs/images/final-setteled-arch.png" alt="final settled architecture" width="420" />
</div>

**TL;DR:** We started with a simple CF Worker router spraying requests + collecting 5xx via a "collector" worker and dumping into Postgres. The collector is just an abstraction—all workers directly publish telemetry to a telemetry topic in Kafka and communicate via kafka-http-bridge.

Now telemetry goes straight from the router → Kafka REST proxy → Go learner (Thompson Sampling) → router. Redis stays only for round-robin state, and learners consume Kafka instead of relying on a fragile Redis buffer.

**Note:** Ngrok works for exposing the router but it rate-limits at ~400 req/min, so I mostly run the router locally for stress tests. (Test-bed still has ngrok URLs baked in if you want to try it.)

---

## How to Run

### Step 1: Deploy Workers

1. `cd` into the `worker` directory
2. Rename `wrangler-example.jsonc` to `wrangler.jsonc`
3. Change the default config as per your requirements
4. Run `npm run deploy` for whatever number of workers you need
5. Copy the deployed URL and paste it in `config/workers.json`

**Note:** Please change the name in `wrangler.jsonc` before deploying another worker, as it will just override your previous worker.

### Step 2: Router + Telemetry

1. `cd` into `router`
2. Copy `wrangler-example.jsonc` to `wrangler.jsonc` if needed
3. Update the `vars` block for your own Kafka REST bridge / Redis / learner URL (for local dev we just point to `http://localhost:8082` + `http://localhost:8090`)
4. Run `pnpm i` (or whatever you use), then `pnpm dev` / `pnpm deploy`

Router now publishes telemetry for every request to Kafka → topic `telemetry`.

### Step 3: Kafka Stack

1. `cd kafka && docker compose up -d`
   - **Please actually run that compose file**—everything assumes those containers are up
   
This spins up:
- Kafka broker (exposes `localhost:29092` for host clients, `magnetar-kafka:9092` for containers)
- Kafka-rest on `http://localhost:8082`
- Kafka-ui on `http://localhost:8080`

2. Open Kafka UI (port 8080) and create the `telemetry` topic manually (router publishes there, learner consumes it)

### Step 4: Learner (Thompson Sampling Brain)

1. `cd learner`
2. Run `go run .` (default env already points to `localhost:29092` + `:8090`)

Learner exposes:
- `GET /recommendation` (router hits this when `algo=proprietary`)

If learner is down, router falls back to round-robin/random so nothing explodes.

### Step 5: Test-Bed

1. `cd test-bed`
2. Run `pnpm i`
3. Run `pnpm dev`

This UI lets you set failure sliders per worker and run stress tests to compare algorithms (see screenshots in `docs/images`).

---

## Stress Test Results

### Round Robin
Round-robin with two workers at 100% fail + one at 90% fail lands around 3% success:

<img src="./docs/findings/Thomson-Sampling/rr.png" alt="round robin chart" width="520" />

### Thompson Sampling
Thompson Sampling shifts traffic toward the least-bad worker and sits closer to 10% success under the same setup:

<img src="./docs/findings/Thomson-Sampling/thomson.png" alt="thomson sampling chart" width="520" />

### Randomness Note
Workers in `percentage_fail` mode literally flip a coin per request (`Math.random() * 100 < PERCENTAGE_FAIL`), so the proprietary line wiggles a few points because it keeps hammering the same "least awful" worker. Round-robin stays glued to its theoretical limit because it splits traffic evenly (two workers contribute 0%, the third contributes whatever its slider says).