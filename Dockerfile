# syntax=docker/dockerfile:1.7
# ═══════════════════════════════════════════════════════════════════
# Stage: base — node:22-alpine with Yarn 4 activated via corepack
#
# node:22-alpine ships with Yarn Classic (1.x) bundled with npm.
# corepack reads `packageManager` from package.json and downloads
# the declared Yarn version on first use. `corepack prepare` pre-fetches
# it during the build so containers never download Yarn at runtime.
# ═══════════════════════════════════════════════════════════════════
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare yarn@4.6.0 --activate


# ═══════════════════════════════════════════════════════════════════
# Stage: deps — install ALL dependencies (dev + prod)
# Shared base for `dev` and `build` stages
# ═══════════════════════════════════════════════════════════════════
FROM base AS deps
WORKDIR /app

# .yarnrc.yml sets nodeLinker: node-modules (classic layout, not PnP)
COPY package.json yarn.lock .yarnrc.yml ./

# BuildKit cache: reuse yarn cache across builds (--mount=type=cache)
RUN --mount=type=cache,target=/root/.yarn,id=yarn_cache \
    YARN_CACHE_FOLDER=/root/.yarn \
    yarn install --immutable


# ═══════════════════════════════════════════════════════════════════
# Stage: dev — development runtime with hot reload
# Source code is bind-mounted at runtime via compose volumes
# ═══════════════════════════════════════════════════════════════════
FROM base AS dev
WORKDIR /app

# Copy pre-installed node_modules from deps stage (layer cache)
COPY --from=deps /app/node_modules ./node_modules

# Source code will be mounted via compose volume at runtime.
# The anonymous volume for node_modules prevents the bind mount
# from overwriting the installed dependencies.
EXPOSE 3000
CMD ["yarn", "start:dev"]


# ═══════════════════════════════════════════════════════════════════
# Stage: build — compile TypeScript to dist/
# ═══════════════════════════════════════════════════════════════════
FROM base AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

# Copy source last for optimal layer caching:
# dependencies rarely change, source changes often
COPY . .

RUN yarn build


# ═══════════════════════════════════════════════════════════════════
# Stage: prod-deps — install PRODUCTION-ONLY dependencies
# Excludes devDependencies: ~no @nestjs/cli, ts-node, jest, etc.
#
# Yarn 4 dropped --production; the replacement is `yarn workspaces focus
# --all --production` via the built-in @yarnpkg/plugin-workspace-tools.
# ═══════════════════════════════════════════════════════════════════
FROM base AS prod-deps
WORKDIR /app

COPY package.json yarn.lock .yarnrc.yml ./

RUN --mount=type=cache,target=/root/.yarn,id=yarn_cache \
    YARN_CACHE_FOLDER=/root/.yarn \
    yarn workspaces focus --all --production


# ═══════════════════════════════════════════════════════════════════
# Stage: prod — minimal production runtime (node:22-alpine, non-root)
# Contains: compiled dist/ + prod node_modules only
# No src/, no devDependencies, no build tools
# ═══════════════════════════════════════════════════════════════════
FROM node:22-alpine AS prod
WORKDIR /app

# Create non-root user before copying files
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# chown ensures process can write schema.gql and any runtime artifacts
COPY --chown=appuser:appgroup --from=build /app/dist ./dist
COPY --chown=appuser:appgroup --from=prod-deps /app/node_modules ./node_modules
COPY --chown=appuser:appgroup package.json ./
COPY --chown=appuser:appgroup proto/ ./proto/

USER appuser

# GraphQL schema written to /tmp (writable by any user)
ENV GRAPHQL_SCHEMA_PATH=/tmp/schema.gql

EXPOSE 3000

# Explicit signal handling via node (not yarn/npm wrapper)
CMD ["node", "dist/src/main.js"]


# ═══════════════════════════════════════════════════════════════════
# Stage: payments-grpc — same prod image, runs the gRPC microservice
# Shares all compiled code with prod; only CMD differs.
# Deploy as a separate container to scale payment processing independently.
# ═══════════════════════════════════════════════════════════════════
FROM prod AS payments-grpc

EXPOSE 50051

CMD ["node", "dist/src/payments-grpc/main.js"]


# ═══════════════════════════════════════════════════════════════════
# Stage: prod-distroless — minimal distroless runtime
# Base: gcr.io/distroless/nodejs22-debian12:nonroot
#   - No shell (sh, bash, ash)
#   - No package manager
#   - No OS tools (curl, wget, etc.)
#   - Runs as UID 65532 (nonroot) by default
# ═══════════════════════════════════════════════════════════════════
FROM gcr.io/distroless/nodejs22-debian12:nonroot AS prod-distroless
WORKDIR /app

COPY --from=build /app/dist ./dist
COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json ./
COPY proto/ ./proto/

# /tmp is writable in distroless; NestJS GraphQL writes schema here
ENV GRAPHQL_SCHEMA_PATH=/tmp/schema.gql

EXPOSE 3000

# distroless nodejs image uses /nodejs/bin/node as ENTRYPOINT
# CMD provides the script argument: equivalent to `node dist/src/main.js`
CMD ["dist/src/main.js"]
