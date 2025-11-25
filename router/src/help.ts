import type { Redis } from "@upstash/redis"
import { avalibleWorkers } from "./constants"
import { BodyType } from "./types/body"

const ROUND_ROBIN_KEY = "roundRobin"

const getRoundRobinWorker = async (redis: Redis) => {
    const totalWorkers = avalibleWorkers.length
    if (totalWorkers === 0) {
        return ""
    }

    const storedIndex = await redis.get<number>(ROUND_ROBIN_KEY)
    if (typeof storedIndex !== "number" || storedIndex < 0 || storedIndex >= totalWorkers) {
        await redis.set(ROUND_ROBIN_KEY, 0)
        return avalibleWorkers[0]
    }

    const nextIndex = (storedIndex + 1) % totalWorkers
    await redis.set(ROUND_ROBIN_KEY, nextIndex)
    return avalibleWorkers[storedIndex]
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