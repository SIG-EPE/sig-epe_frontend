import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/constants";

// -------------------------------------------------------
// Management page — legacy redirect for bookmarked URLs
// -------------------------------------------------------

export default function ManagementPage() {
  redirect(ROUTES.REQUESTS);
}
