\set ON_ERROR_STOP on
\connect weather

-- After the first migration, run through the same approved private admin path.
SET ROLE :"migration_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.users, public.sessions, public.preferences, public.rate_limits TO :"api_role";
REVOKE ALL ON public.schema_migrations FROM :"api_role";
RESET ROLE;
