import fs from "fs";

/**
 * Updates a JSON file by replacing the value of an existing top-level key.
 * @param filePath Absolute or relative path to the JSON file.
 * @param key Key to update in the JSON object.
 * @param value New value to assign to the key.
 * @throws If the file does not exist, is invalid JSON, or the key does not exist.
 */
export function updateJsonKey(
    filePath: string,
    key: string,
    value: unknown
  ) {
  
    if (!fs.existsSync(filePath)) {
      throw new Error(`JSON file not found: ${filePath}`);
    }
  
    const raw = fs.readFileSync(filePath, "utf8");
  
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new Error(`Invalid JSON in file: ${filePath}`);
    }
  
    if (!(key in json)) {
      throw new Error(`Key does not exist in JSON: ${key}`);
    }
  
    json[key] = value;
  
    fs.writeFileSync(filePath, JSON.stringify(json, null, 2));
  }
  