import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/easy")({
  component: ExtraSimpleLayout,
});

function ExtraSimpleLayout() {
  return <Outlet />;
}