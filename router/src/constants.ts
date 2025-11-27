import workerConfig from "../../config/workers.json"

const { workerUrls } = workerConfig

export const avalibleWorkers = Array.isArray(workerUrls) ? workerUrls : []