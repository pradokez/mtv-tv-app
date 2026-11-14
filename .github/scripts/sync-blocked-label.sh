#!/usr/bin/env bash
# Mantém a label `blocked` em dia: uma issue aberta fica `blocked` enquanto
# alguma issue citada na seção "## Blocked by" do corpo ainda estiver aberta.
# Uso: sync-blocked-label.sh [--dry-run]   (precisa de GH_TOKEN e REPO)
set -euo pipefail

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true
REPO="${REPO:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"

$DRY_RUN || gh label create blocked --repo "$REPO" --color B60205 \
  --description "Espera outra issue (seção Blocked by) ser fechada" --force >/dev/null

# Saída: "<número> <true|false>" — se a issue aberta deve ter a label.
desired=$(gh issue list --repo "$REPO" --state all --limit 1000 \
  --json number,state,body,labels | jq -r '
  (map({key: (.number|tostring), value: .state}) | from_entries) as $state
  | .[] | select(.state == "OPEN")
  | {
      n: .number,
      has: (any(.labels[]; .name == "blocked")),
      blockers: (
        (.body // "" | split("\n")
          | reduce .[] as $l ({on: false, refs: []};
              if ($l | test("^#{1,6}\\s")) then .on = ($l | test("^#{1,6}\\s+Blocked by\\s*$"; "i"))
              elif .on then .refs += [$l | scan("#([0-9]+)") | .[0]]
              else . end)
          | .refs)
      )
    }
  | .want = any(.blockers[]; $state[.] == "OPEN")
  | select(.want != .has)
  | "\(.n) \(.want)"')

while read -r n want; do
  [[ -z "${n:-}" ]] && continue
  if [[ "$want" == "true" ]]; then
    echo "#$n: + blocked"
    $DRY_RUN || gh issue edit "$n" --repo "$REPO" --add-label blocked
  else
    echo "#$n: - blocked"
    $DRY_RUN || gh issue edit "$n" --repo "$REPO" --remove-label blocked
  fi
done <<< "$desired"
