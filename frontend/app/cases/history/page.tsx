import { ClinicalBoundary } from "@/features/clinical-intake/components/clinical-boundary";
import { CaseHistory } from "@/features/clinical-intake/components/case-history";
export default function CaseHistoryPage() { return <ClinicalBoundary permissions={["CASE_READ"]}><CaseHistory /></ClinicalBoundary>; }
