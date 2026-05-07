import "dotenv/config";
import { buildApp } from "./app.js";
import { buildContainer } from "./container.js";
import { loadEnv } from "./env.js";

const env = loadEnv();
const container = buildContainer(env);
const app = buildApp(container);

app.listen(env.API_PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[api] listening on http://localhost:${env.API_PORT}`);
});
