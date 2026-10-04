-- Phase 4A: TBCall referral continuity, not an official SITB physical schema.
CREATE UNIQUE INDEX uq_referrals_one_inflight_per_case
    ON referrals(case_id)
    WHERE status IN ('SENT','RECEIVED');

CREATE INDEX idx_referrals_source_status
    ON referrals(source_facility_id, status, sent_at DESC);

ALTER TABLE referrals ADD COLUMN return_reason text;
