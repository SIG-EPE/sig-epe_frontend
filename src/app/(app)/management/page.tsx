import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/constants";

export default function ManagementPage() {
  redirect(ROUTES.DASHBOARD_GIOF);
}
