import { Redis } from '@upstash/redis/cloudflare'

export const getRedisClient = (url: string, token: string) => {
    return new Redis({
        url: url,
        token: token,
    })
}