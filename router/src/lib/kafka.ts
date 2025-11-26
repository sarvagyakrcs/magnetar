/**
 * Helper utilities for producing JSON records through the Kafka REST Proxy.
 * These functions are Cloudflare Worker friendly (no Node-only APIs).
 */

export type KafkaRestRecord<TValue = unknown, TKey = string | undefined> = {
  key?: TKey;
  value: TValue;
  headers?: Record<string, string>;
};

export type KafkaRestPayload<TValue = unknown, TKey = string | undefined> = {
  records: KafkaRestRecord<TValue, TKey>[];
};

export type KafkaRestResponse = {
  offsets: Array<{
    partition: number;
    offset: number;
    error_code: number | null;
    error: string | null;
  }>;
  key_schema_id: number | null;
  value_schema_id: number | null;
};

export type KafkaRestRequestOptions = {
  /**
   * Override fetch implementation (useful for unit tests).
   */
  fetcher?: typeof fetch;
  /**
   * Optional request headers. Default Kafka REST headers are always applied.
   */
  headers?: Record<string, string>;
  /**
   * Optional AbortSignal for request cancellation.
   */
  signal?: AbortSignal;
};

/**
 * Normalize a base URL and topic name into the Kafka REST endpoint.
 */
export const buildKafkaTopicUrl = (baseUrl: string, topic: string): string => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return `${normalizedBase}/topics/${topic}`;
};

const KAFKA_REST_HEADERS = {
  Accept: "application/vnd.kafka.v2+json",
  "Content-Type": "application/vnd.kafka.json.v2+json",
};

/**
 * Produce JSON records to Kafka through the REST Proxy.
 *
 * @param url   Full REST endpoint (e.g. https://example.ngrok-free.app/topics/failures)
 * @param payload Kafka REST JSON payload.
 * @param options Optional overrides (custom fetcher, headers, signal).
 */
export const produceKafkaJson = async <TValue = unknown, TKey = string>(
  url: string,
  payload: KafkaRestPayload<TValue, TKey>,
  options: KafkaRestRequestOptions = {}
): Promise<KafkaRestResponse> => {
  const fetcher = options.fetcher ?? fetch;
  const headers = {
    ...KAFKA_REST_HEADERS,
    ...options.headers,
  };

  const response = await fetcher(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: options.signal,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Kafka REST proxy responded with ${response.status}: ${errorBody}`
    );
  }

  return (await response.json()) as KafkaRestResponse;
};
