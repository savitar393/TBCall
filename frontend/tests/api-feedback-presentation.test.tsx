import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { ApiFeedback, ApiFeedbackBoundary } from "@/components/api-feedback";
import { DeduplicatedQueryState as QueryState, QueryState as ExistingQueryState } from "@/features/clinical-intake/components/query-state";
import { Confirmation } from "@/features/continuity/confirmation";
import { ApiError } from "@/lib/api/problem";

it("announces an identical shell and section failure only once", () => {
  const error = new ApiError({ status: 404, title: "Synthetic unavailable record" });
  render(<ApiFeedbackBoundary error={error}><QueryState query={{ isPending: false, error, refetch() {} }} /></ApiFeedbackBoundary>);
  expect(screen.getAllByRole("alert")).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Coba kembali" })).toBeEnabled();
});
it("retains separate errors and restores section feedback when the shell error clears", () => {
  const outer = new ApiError({ status: 404, title: "Synthetic record" });
  const inner = new ApiError({ status: 503, title: "Synthetic catalog" });
  const { rerender } = render(<ApiFeedbackBoundary error={outer}><QueryState query={{ isPending: false, error: inner, refetch() {} }} /></ApiFeedbackBoundary>);
  expect(screen.getAllByRole("alert")).toHaveLength(2);
  rerender(<ApiFeedbackBoundary error={null}><QueryState query={{ isPending: false, error: inner, refetch() {} }} /></ApiFeedbackBoundary>);
  expect(screen.getAllByRole("alert")).toHaveLength(1);
});
it("keeps local feedback when no presenting shell exists", () => {
  render(<QueryState query={{ isPending: false, error: new ApiError({ status: 404, title: "Synthetic record" }), refetch() {} }} />);
  expect(screen.getAllByRole("alert")).toHaveLength(1);
});

it("preserves mutation feedback inside confirmations even when the shell has the same error", () => {
  const error = new ApiError({ status: 403, title: "Synthetic CSRF failure", code: "CSRF_INVALID" });
  render(<ApiFeedbackBoundary error={error}><section role="dialog" aria-label="Konfirmasi"><ApiFeedback error={error} /></section></ApiFeedbackBoundary>);
  expect(screen.getAllByRole("alert")).toHaveLength(2);
  expect(screen.getByRole("dialog", { name: "Konfirmasi" })).toHaveTextContent("Permintaan");
});

it("keeps a failed read accessible inside a real modal while the shell is inert", () => {
  const error = new ApiError({ status: 404, title: "Synthetic event" });
  render(<ApiFeedbackBoundary error={error}><Confirmation title="Kegiatan fiksi" onClose={() => {}}><QueryState query={{ isPending: false, error, refetch() {} }} /></Confirmation></ApiFeedbackBoundary>);
  const modal = screen.getByRole("dialog", { name: "Kegiatan fiksi" });
  expect(within(modal).getByRole("alert")).toBeInTheDocument();
  expect(within(modal).getByRole("button", { name: "Coba kembali" })).toBeEnabled();
  expect(screen.getAllByRole("alert")).toHaveLength(1);
});

it("preserves unrelated views that require an error inside their own section", () => {
  const error = new ApiError({ status: 404, title: "Synthetic history" });
  render(<ApiFeedbackBoundary error={error}><section aria-label="Status riwayat"><ExistingQueryState query={{ isPending: false, error, refetch() {} }} /></section></ApiFeedbackBoundary>);
  expect(within(screen.getByRole("region", { name: "Status riwayat" })).getByRole("alert")).toBeInTheDocument();
});
