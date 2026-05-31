# Dev server for Social Games (dev-only — nothing here ships).
PORT ?= 8000

.PHONY: serve
serve: ## Serve the folder with caching disabled, so edits show on refresh
	python3 serve.py $(PORT)
