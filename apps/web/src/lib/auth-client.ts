"use client";

import { createAuthClient } from "better-auth/react";
import { genericOAuthClient, magicLinkClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [magicLinkClient(), genericOAuthClient()],
});

// Better Auth's microsoftEntraId helper registers this provider id.
export const ENTRA_PROVIDER_ID = "microsoft-entra-id";
