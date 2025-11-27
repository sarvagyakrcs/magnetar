import type { Redis } from "@upstash/redis"
import { avalibleWorkers } from "./constants"
import { requestLearnerRecommendation, type LearnerRequestContext } from "./lib/learner"
import type { Bindings } from "./types/bindings"
import { BodyType } from "./types/body"

const ROUND_ROBIN_KEY = "roundRobin"

const getRoundRobinWorker = async (redis: Redis) => {
    const totalWorkers = avalibleWorkers.length
    if (totalWorkers === 0) {
        return ""
    }

    const counter = await redis.incr(ROUND_ROBIN_KEY)
    const index = ((counter - 1) % totalWorkers + totalWorkers) % totalWorkers
    return avalibleWorkers[index]
}

const getRandomWorker = () => {
    const totalWorkers = avalibleWorkers.length
    if (totalWorkers === 0) {
        return ""
    }
    const index = Math.floor(Math.random() * totalWorkers)
    return avalibleWorkers[index]
}

type WorkerSelectionOptions = {
    env?: Bindings
    learnerContext?: LearnerRequestContext
}

export const getWorkerUrl = async (
    algo: BodyType["algo"],
    redis: Redis,
    options?: WorkerSelectionOptions
) : Promise<string> => {
    switch (algo) {
        case "roundRobin":
            return getRoundRobinWorker(redis)
        case "random":
            return getRandomWorker()
        case "proprietry":
            if (options?.env && options?.learnerContext) {
                const learnerWorker = await requestLearnerRecommendation(options.env, options.learnerContext)
                if (learnerWorker && learnerWorker.trim() !== "") {
                    return learnerWorker
                }
            }
            return getRandomWorker()
    }
    return ""
}