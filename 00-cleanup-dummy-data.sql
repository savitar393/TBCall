-- ============================================================
-- Cleanup Dummy Data
-- Remove all dummy data while keeping schema and reference data
-- WARNING: This will delete all transaction data!
-- ============================================================

BEGIN;

-- Disable triggers temporarily for faster deletion
SET session_replication_role = 'replica';

-- Delete all transaction data in correct order (respecting foreign keys)
TRUNCATE TABLE 
    notifications,
    alerts,
    monitoring_events,
    monitoring_plans,
    adverse_events,
    patient_supporters,
    treatment_outcomes,
    follow_ups,
    dose_events,
    treatment_drugs,
    treatments,
    preventive_treatments,
    contact_investigations,
    contacts,
    referrals,
    lab_results,
    lab_specimens,
    lab_request_tests,
    lab_requests,
    diagnoses,
    tb_cases,
    tb_registrations,
    patient_user_links,
    patients,
    user_verification_tokens,
    user_sessions,
    user_facilities,
    user_roles,
    users,
    sync_items,
    sync_runs,
    external_identifiers,
    audit_logs
RESTART IDENTITY CASCADE;

-- Keep these tables (reference data and structural):
-- - facility_types, sex_codes, tb_suspect_types, etc.
-- - facilities (if you want to keep facilities, comment out below)
-- - roles, permissions, role_permissions
-- - drugs, regimens, regimen_drugs
-- - external_systems

-- Optional: Also clean facilities if needed
-- TRUNCATE TABLE facilities RESTART IDENTITY CASCADE;

-- Re-enable triggers
SET session_replication_role = 'origin';

-- Report
DO $$
BEGIN
    RAISE NOTICE '==============================================';
    RAISE NOTICE 'Cleanup Complete!';
    RAISE NOTICE '==============================================';
    RAISE NOTICE 'All dummy data has been removed.';
    RAISE NOTICE 'Reference data and schema preserved.';
    RAISE NOTICE '';
    RAISE NOTICE 'You can now run V99 again to regenerate dummy data.';
    RAISE NOTICE '==============================================';
END $$;

COMMIT;
