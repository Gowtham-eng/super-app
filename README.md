# Here are your Instructions

## REX pilot source boundary

The REX tile uses the approved monogram from `frontend/public/rex-monogram.png`.
It appears only after a live OIDC app is registered with the exact name
`REX - Refex Executive Agent`, `access_mode=assigned_only`, an allowlisted
EIOS callback, and explicit pilot executive assignments. The Refex One OIDC
client secret belongs in the EIOS server's GCP secret store. Source code and a
frontend build do not register the app or deploy the tile.

See `DOCUMENTATION.md` for the assignment and rollout gates.
