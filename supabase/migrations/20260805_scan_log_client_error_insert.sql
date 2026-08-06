-- Lets the mobile client report fatal JS errors into scan_log.
--
-- iOS crash reports name only RCTFatal, never the JavaScript error behind it
-- (2026-08-05 TestFlight crash). src/lib/crashReporter.ts writes the message
-- and stack here on the way down.
--
-- INSERT only, and only rows tagged 'client_error', so the public anon key
-- cannot forge extraction results. There is still no SELECT policy, so clients
-- cannot read the table back.
create policy scan_log_insert_client_error
  on public.scan_log
  for insert
  to anon, authenticated
  with check (outcome = 'client_error');
