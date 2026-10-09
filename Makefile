# The one mechanical guard. Everything else in this project's discipline is a habit an
# agent must remember, and habits do not survive a session boundary.
#
# The last line is the point: it pastes into the worklog rather than being retyped. It
# prints even when the run is red, and `check` still exits non-zero — a red baseline in the
# worklog tells the next session the truth; no line at all tells it nothing.
#
# `properties` counts `testing.md`'s catalog boxes: `[x]` green and mutation-verified, `[ ]`
# not yet written. `grep -c` prints 0 *and* exits 1 on no match, so pipe through head and
# let $(or) cover a missing file rather than `|| echo 0`, which double-counts.

.PHONY: check
check: ## the session baseline — its last line pastes into the worklog
	@npx biome check .
	@npx tsc -p tsconfig.json
	@npx vitest run; status=$$?; \
	  echo "baseline: properties=$(PROPS_DONE)/$(PROPS) green tests=$$(node tools/test-counts)"; \
	  exit $$status

PROPS      := $(or $(shell grep -cE '^- \[[ x]\] \*\*P' testing.md 2>/dev/null | head -1),0)
PROPS_DONE := $(or $(shell grep -cE '^- \[x\] \*\*P' testing.md 2>/dev/null | head -1),0)
