\set ON_ERROR_STOP on
\connect postgres

-- Run only as the approved Entra administrator through a private operations path.
SELECT * FROM pgaadauth_create_principal_with_oid(:'api_role', :'api_object_id', 'service', false, false);
SELECT * FROM pgaadauth_create_principal_with_oid(:'migration_role', :'migration_object_id', 'service', false, false);

REVOKE ALL ON DATABASE weather FROM PUBLIC;
GRANT CONNECT ON DATABASE weather TO :"api_role", :"migration_role";
-- The human SQL administrator can grant access to migration-owned tables later.
GRANT :"migration_role" TO CURRENT_USER;

\connect weather
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO :"api_role";
GRANT USAGE, CREATE ON SCHEMA public TO :"migration_role";
