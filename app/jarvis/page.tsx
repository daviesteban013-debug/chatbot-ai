import { redirect } from "next/navigation";

export default function JarvisRedirectPage() {
  redirect("/dashboard/jarvis?paid=1");
}
