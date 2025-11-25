import { WorkerConfig } from "../../types/worker.config";
import data from "@/../config/workers.json" assert { type: "json" };
const typed: WorkerConfig = data;

export default function Home() {
  return (
    <div>
      <pre>
        {JSON.stringify(typed, null, 2)}
      </pre>
    </div>
  )
}