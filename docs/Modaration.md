// Manage the HairGames blocklist and review the suspicious-activity log. Run from the repo root on
// the server (it uses the same MongoDB as the backend):
//
//   node backend/scripts/blocklist.js ban <wallet> [--reason "text"] [--days N] [--notes "text"] [--by name]
//   node backend/scripts/blocklist.js unban <wallet>
//   node backend/scripts/blocklist.js list
//   node backend/scripts/blocklist.js suspicious [wallet] [--limit N]
//   node backend/scripts/blocklist.js top [--days N]
//
// `--reason` is shown to the player; `--notes` is internal. Without `--days` a ban is permanent.