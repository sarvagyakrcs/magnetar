import type { Redis } from "@upstash/redis"
import { avalibleWorkers } from "./constants"
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

export const getWorkerUrl = async (algo: BodyType["algo"], redis: Redis) : Promise<string> => {
    switch (algo) {
        case "roundRobin":
            return getRoundRobinWorker(redis)
        case "random":
            return getRandomWorker()
        case "proprietry":
            return avalibleWorkers[2]
    }
    return ""
}