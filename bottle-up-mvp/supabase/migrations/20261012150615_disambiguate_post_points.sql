-- Preserve the legacy implementation and its permissions under a distinct
-- name. All installed application callers use the current six-argument helper.
-- Renaming preserves the function OID, body, ownership and ACLs, while removing
-- the default-argument ambiguity for verification/redemption/refund calls.
-- Fresh projects have only the current helper; replay is a no-op.
do $$
begin
  if to_regprocedure('bottleup_private.post_points(uuid,text,integer,uuid,uuid,numeric,integer)') is not null then
    alter function bottleup_private.post_points(uuid,text,integer,uuid,uuid,numeric,integer)
      rename to post_points_with_rate;
  end if;
end $$;
