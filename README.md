## Magnetar
(not an acronym)

- This is SLaB 2.0 and i am calling it magnetar, SLaB 1.0 was very close to being a vaiable MvP but it could't now i am trying again with a refined architecture, hope it succeeds.

- Current first draft 
<img src="./docs/images/basic-first-draft.png" alt="none" />

## How to run
### Step - 1
- cd into the worker dir
- change the name of `wrangler-example.jsonc` to `wrangler.jsonc`
- then change the default config as per your requirements
- then run `npm run deploy` for whatever number of workers you need 
- copy the deployed url and make sure to paste in `config/workers.json`
- Note : please change the name in `wrangler.jsonc` before deploying another worker as it will just oveeride your previous worker
