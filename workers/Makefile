# Run lint + tests for every Python worker. Each worker is an independent uv project.
WORKERS := cases satellite detector thumbs

.PHONY: check lint test format

check: lint test

lint:
	@set -e; for w in $(WORKERS); do \
	  echo "== ruff $$w"; \
	  (cd $$w && uv run --extra dev ruff check . && uv run --extra dev ruff format --check .); \
	done

test:
	@set -e; for w in $(WORKERS); do \
	  echo "== pytest $$w"; \
	  (cd $$w && uv run --extra dev pytest); \
	done

format:
	@set -e; for w in $(WORKERS); do (cd $$w && uv run --extra dev ruff format . && uv run --extra dev ruff check --fix .); done
