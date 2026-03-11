import { redirect } from "react-router";
import type { Route } from "./+types/walks-redirect";

export function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  return redirect(`/vandringar${url.search}`, 301);
}
