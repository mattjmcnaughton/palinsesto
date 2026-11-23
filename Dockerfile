FROM node:22-slim AS frontend
RUN npm install -g pnpm@11.21.0
WORKDIR /frontend
COPY src/palinsesto/web/frontend/package.json src/palinsesto/web/frontend/pnpm-lock.yaml src/palinsesto/web/frontend/pnpm-workspace.yaml src/palinsesto/web/frontend/.npmrc ./
RUN pnpm install --frozen-lockfile
COPY src/palinsesto/web/frontend/ ./
RUN pnpm build

FROM python:3.12-slim AS backend
COPY --from=ghcr.io/astral-sh/uv:0.12.3 /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock README.md ./
RUN uv sync --frozen --no-dev --no-install-project
COPY src/ ./src/
# The browser build is the runtime asset; source, tests and tooling stay in build stages.
RUN rm -rf ./src/palinsesto/web/frontend
COPY --from=frontend /frontend/dist ./src/palinsesto/web/frontend/dist
RUN uv sync --frozen --no-dev

FROM python:3.12-slim AS production
RUN groupadd --gid 1000 app && useradd --uid 1000 --gid 1000 --create-home app
WORKDIR /app
COPY --from=backend --chown=app:app /app/.venv /app/.venv
COPY --from=backend --chown=app:app /app/src /app/src
COPY --chown=app:app alembic.ini ./
COPY --chown=app:app alembic/ ./alembic/
ENV PATH="/app/.venv/bin:$PATH"
USER app
EXPOSE 8000
CMD ["uvicorn", "palinsesto.app:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
