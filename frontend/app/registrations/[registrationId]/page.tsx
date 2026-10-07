import { ClinicalBoundary } from "@/features/clinical-intake/components/clinical-boundary";
import { RegistrationDetail } from "@/features/clinical-intake/components/registration-detail";
export default async function RegistrationPage({ params }: { params: Promise<{ registrationId: string }> }) { const { registrationId } = await params; return <ClinicalBoundary permissions={["REGISTRATION_READ"]}><RegistrationDetail id={registrationId} /></ClinicalBoundary>; }
