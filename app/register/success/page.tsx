import { Suspense } from "react";
import { redirect } from "next/navigation";
import { RegisterShell } from "@/components/register-shell";
import { StatusBadge } from "@/components/ui/status-badge";

export const metadata = { title: "Registration Successful" };

const successMessages = {
  customer: "Customer Registration Successful!",
  mr: "MR Registration Successful!",
  patient: "Patient Registration Successful!",
} as const;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function isRegistrationType(type: string): type is keyof typeof successMessages {
  return Object.hasOwn(successMessages, type);
}

export default function SuccessPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={<RegistrationSuccess title="Registration Successful" />}>
      <RegistrationSuccessPage searchParams={searchParams} />
    </Suspense>
  );
}

async function RegistrationSuccessPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const type = params.type;
  if (typeof type !== "string" || !isRegistrationType(type)) {
    redirect("/register");
  }

  return <RegistrationSuccess title={successMessages[type]} />;
}

function RegistrationSuccess({ title }: { title: string }) {
  return (
    <RegisterShell title={title} subtitle="">
      <div className="space-y-5">
        <StatusBadge value="pending_verification" />
        <p className="text-base leading-7 text-muted">
          After approval, you will receive an email containing your Master Code username. The
          password you created during registration will never be sent via email and will remain
          inaccessible to backend staff.
        </p>
      </div>
    </RegisterShell>
  );
}
