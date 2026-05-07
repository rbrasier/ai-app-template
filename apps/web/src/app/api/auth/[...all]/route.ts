import { toNextJsHandler } from "better-auth/next-js";
import { getContainer } from "@/lib/container";

const { auth } = getContainer();
export const { GET, POST } = toNextJsHandler(auth);
