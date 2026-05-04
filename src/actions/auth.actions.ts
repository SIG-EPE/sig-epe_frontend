"use server";

import { cookies } from "next/headers";

function expireSessionCookie(name: string) {
  return {
    name,
    value: "",
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      maxAge: 0,
    },
  };
}

/**
 * Clears every session cookie used by the app so inactivity logout cannot
 * silently continue through refresh on the next navigation.
 */
export async function clearSessionAction() {
  const cookieStore = await cookies();

  for (const cookie of [
    expireSessionCookie("access_token"),
    expireSessionCookie("refresh_token"),
  ]) {
    cookieStore.set(cookie.name, cookie.value, cookie.options);
  }
}
