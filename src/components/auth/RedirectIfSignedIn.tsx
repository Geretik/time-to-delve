import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

/** Renders nothing; sends signed-in users straight to the generator. */
export async function RedirectIfSignedIn() {
  if (await getCurrentUser()) redirect("/generator");
  return null;
}
