const DEPLOYED_ROUTER_URL = "https://magnetar-router.chiefsarvagya.workers.dev"
const LOCAL_ROUTER_URL = "http://localhost:8787"

export const ROUTER_SERVICE_PATH = "/service"
export const PORTFOLIO_URL = "https://thesarvagyakumar.site"

const ROUTER_ENV_URL =
  process.env.NEXT_PUBLIC_MAGNETAR_ROUTER_URL ??
  process.env.MAGNETAR_ROUTER_URL ??
  ""

type RouterUrlOptions = {
  preferLocalFallback?: boolean
}

export const getRouterUrl = (options?: RouterUrlOptions) => {
  if (ROUTER_ENV_URL) {
    return ROUTER_ENV_URL
  }
  if (options?.preferLocalFallback) {
    return LOCAL_ROUTER_URL
  }
  return DEPLOYED_ROUTER_URL
}

export const AVAILABLE_WORKERS = [
  "https://worker.apshabd.workers.dev/",
  "https://worker2.apshabd.workers.dev",
  "https://worker3.apshabd.workers.dev",
]

export const ROUTER_URLS = {
  deployed: DEPLOYED_ROUTER_URL,
  local: LOCAL_ROUTER_URL,
} as const

export type RouterTargetId = keyof typeof ROUTER_URLS

export const ROUTER_TARGETS: Array<{
  id: RouterTargetId
  label: string
  description: string
  url: string
}> = [
  {
    id: "deployed",
    label: "Deployed Router",
    description: "Cloudflare Worker in production",
    url: ROUTER_URLS.deployed,
  },
  {
    id: "local",
    label: "Local Wrangler Dev (localhost:8787)",
    description: "wrangler dev server running on your machine",
    url: ROUTER_URLS.local,
  },
]

export const getRouterUrlByTarget = (targetId: RouterTargetId | undefined) => {
  const target = ROUTER_TARGETS.find((entry) => entry.id === targetId)
  return target?.url ?? getRouterUrl({ preferLocalFallback: true })
}

