import { auth } from "@clerk/nextjs/server";

import { WorkflowShell } from "@/components/layout";

export default async function WorkflowLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await auth.protect();

  return <WorkflowShell>{children}</WorkflowShell>;
}
