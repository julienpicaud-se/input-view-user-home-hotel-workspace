import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/benchmarks")({
  head: () => ({
    meta: [
      { title: "Benchmarks — RA+" },
      {
        name: "description",
        content: "Compare your hotel against similar Mediterranean properties.",
      },
    ],
  }),
  component: BenchmarksRedirect,
});

function BenchmarksRedirect() {
  return <Navigate to="/" search={{ tab: "benchmarks" } as never} replace />;
}
