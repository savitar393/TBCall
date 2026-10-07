import { ClinicalBoundary } from "@/features/clinical-intake/components/clinical-boundary";
import { RegistrationWizard } from "@/features/clinical-intake/components/registration-wizard";
export default function RegistrationWizardPage() { return <ClinicalBoundary permissions={["PATIENT_CREATE", "REGISTRATION_WRITE"]}><RegistrationWizard /></ClinicalBoundary>; }
