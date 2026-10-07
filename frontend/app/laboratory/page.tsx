import { LaboratoryBoundary } from "@/features/laboratory/components/laboratory-boundary";
import { RequestQueue } from "@/features/laboratory/components/request-queue";
export default function LaboratoryPage() { return <LaboratoryBoundary mode="read"><RequestQueue /></LaboratoryBoundary>; }
