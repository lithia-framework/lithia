import type { ReactNode } from "react";
import { homeOptions } from "@/lib/layout.shared";
import { HomeLayout } from "@/layouts/home";

export default function Layout({ children }: { children: ReactNode }) {
  return <HomeLayout {...homeOptions}>{children}</HomeLayout>;
}