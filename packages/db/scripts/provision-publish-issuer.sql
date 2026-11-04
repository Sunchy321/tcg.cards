-- Provisions the publish credential issuer once per remote database.
--
-- The issuer is the login the console service uses to mint per-account publish
-- credentials. It never publishes on its own: it only creates the account's
-- login role, rotates that role's password, and grants it the shared
-- `publish_writer` privilege role that the remote migration created.
--
-- Run as a role that may create roles, with the password supplied out of band:
--
--   psql "$PUBLISH_DATABASE_URL" \
--     -v issuer_password="$(openssl rand -hex 24)" \
--     -f packages/db/scripts/provision-publish-issuer.sql
--
-- Store the same password in the service secret PUBLISH_ADMIN_CONNECTION_STRING.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'publish_issuer') THEN
    CREATE ROLE publish_issuer LOGIN CREATEROLE;
  END IF;
END $$;

ALTER ROLE publish_issuer LOGIN CREATEROLE PASSWORD :'issuer_password';

-- ADMIN OPTION lets the issuer grant the privilege role to the account roles it creates.
GRANT publish_writer TO publish_issuer WITH ADMIN OPTION;
