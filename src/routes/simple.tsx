import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/simple")({
  component: SimpleLayout,
});

function SimpleLayout() {
  return <Outlet />;
}
