# Here are your Instructions

## REX pilot source boundary

The REX tile uses the approved monogram from `frontend/public/rex-monogram.png`.
It appears only after a live OIDC app is registered with the exact name
`REX - Refex Executive Agent`, `access_mode=assigned_only`, an allowlisted
EIOS callback, and explicit pilot executive assignments. The Refex One OIDC
client secret belongs in the EIOS server's GCP secret store. Source code and a
frontend build do not register the app or deploy the tile.
The OIDC admin form selects active users by name and work email but saves their
server-owned Refex One IDs. The backend rejects unknown, duplicate, disabled,
and other-organization IDs; leaving assignments empty denies everyone.

An assigned-only tile first prepares a five-minute, single-use HttpOnly launch
grant through the authenticated Refex One API. The browser then opens the
app's HTTPS home URL, which starts the OIDC authorization-code flow. The REX
path does not put the Refex One IAM token in a URL or accept it at authorize.

See `DOCUMENTATION.md` for the assignment and rollout gates.
