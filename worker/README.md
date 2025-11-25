## Worker
- takes a request from a router which is another cf worker
    - url set in `wrangler.jsonc`
- sends response back to router (services the request, with a nominal delay to simulate processing time)
    - the `delay` is also set in `wrangler.jsonc`
    - the `mode` is also set in `wrangler.jsonc`
        - mode can be "All Success", "All fail", `percentage` fail
<!-- on a second thought why would a server write failure its not its job its the job of the load balancer or the router -->
- ~~writes failures to kafka via kafka http bridge exposed via ngrok~~
    - ~~the `writeUrl` is set in `wrangler.jsonc`~~
---
<!-- Optional -->
### V2.0 additions
- writes failures to a persistant store i.e neon postgres

<!-- Tip to run or deploy your own instance -->
- change name of `wrangler-example.jsonc` to `wrangler.jsonc`
- fill in the env vars
- run `npm run deploy` or `bun run deploy`
    - I prefer bun
- Note: if you are deploying another worker make sure you do `rm -rf .wrangler`[OPTIONAL BUT RECOMMENDED], and change the project name in `wrangler.jsonc`
    - i prefer `worker`, `worker2`, `worker3` ...