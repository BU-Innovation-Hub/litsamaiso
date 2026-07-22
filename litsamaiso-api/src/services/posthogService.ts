import { PostHog } from "posthog-node";

const POSTHOG_API_KEY = process.env.POSTHOG_PROJECT_TOKEN || "";
const POSTHOG_HOST = process.env.POSTHOG_HOST || "https://us.i.posthog.com";

let posthogClient: PostHog | null = null;

export function getPosthogClient(): PostHog {
  if (!posthogClient) {
    posthogClient = new PostHog(POSTHOG_API_KEY, {
      host: POSTHOG_HOST,
      enableExceptionAutocapture: true,
    });
  }
  return posthogClient;
}

export async function shutdownPosthog(): Promise<void> {
  if (posthogClient) {
    await posthogClient.shutdown();
    posthogClient = null;
  }
}
