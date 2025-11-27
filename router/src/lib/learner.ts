import type { Bindings } from "../types/bindings"

type RecommendationResponse = {
  workerUrl?: string
  sampledScore?: number
  scores?: Array<{
    workerUrl: string
    sample: number
    mean: number
    successes: number
    failures: number
  }>
}

export type LearnerRequestContext = {
  path: string
  query?: string
  requestId: string
}

const buildRecommendationUrl = (baseUrl: string, context: LearnerRequestContext) => {
  const url = new URL("/recommendation", baseUrl)
  if (context.path) {
    url.searchParams.set("path", context.path)
  }
  if (context.query) {
    url.searchParams.set("query", context.query)
  }
  url.searchParams.set("requestId", context.requestId)
  return url
}

export const requestLearnerRecommendation = async (
  env: Bindings,
  context: LearnerRequestContext
): Promise<string | undefined> => {
  const baseUrl = env.LEARNER_URL
  if (!baseUrl) {
    console.warn("LEARNER_URL is not configured; skipping learner recommendation")
    return undefined
  }

  let endpoint: URL
  try {
    endpoint = buildRecommendationUrl(baseUrl, context)
  } catch (error) {
    console.warn("Invalid LEARNER_URL", error)
    return undefined
  }

  try {
    const response = await fetch(endpoint.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        "x-request-id": context.requestId,
      },
    })
    if (!response.ok) {
      console.warn("Learner recommendation request failed", response.status, response.statusText)
      return undefined
    }

    const payload = (await response.json()) as RecommendationResponse
    if (payload?.workerUrl && payload.workerUrl.trim() !== "") {
      return payload.workerUrl.trim()
    }
  } catch (error) {
    console.warn("Failed to contact learner", error)
  }
  return undefined
}

