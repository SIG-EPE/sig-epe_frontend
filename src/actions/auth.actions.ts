"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Clears the session httpOnly cookie (access_token) and redirects to login.
 */
export async function clearSessionAction() {
  const cookieStore = await cookies();
  cookieStore.set("access_token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
  });
  redirect("/login?reason=inactividad");
}