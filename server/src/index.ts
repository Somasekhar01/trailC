import mongoose from "mongoose";
import { app } from "./app.js";
import { config } from "./config.js";

await mongoose.connect(config.MONGODB_URI, { maxPoolSize: 20, serverSelectionTimeoutMS: 5000 });
const server = app.listen(config.PORT, () => {
  console.log(JSON.stringify({ level: "info", message: "cafe-api-started", port: config.PORT }));
});

async function shutdown(signal: string): Promise<void> {
  console.log(JSON.stringify({ level: "info", message: "shutdown-started", signal }));
  server.close(async (error) => {
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
    await mongoose.disconnect();
  });
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
