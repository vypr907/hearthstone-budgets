import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Hearthstone" },
      {
        name: "description",
        content:
          "Shared household budget and debt-payoff tracker for two people.",
      },
      { property: "og:title", content: "Hearthstone" },
      {
        property: "og:description",
        content:
          "Shared household budget and debt-payoff tracker for two people.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/app" });
  },
});
