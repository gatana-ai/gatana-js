# Default recipe: list all available commands
default:
    @just --list

# Build all packages (SDK first, then CLI)
build:
    pnpm -r build

# Build only the SDK
build-sdk:
    pnpm --filter gatana-sdk build

# Build only the CLI
build-cli:
    pnpm --filter gatana build

# Watch both packages for changes
dev:
    pnpm -r --parallel dev

# Run all tests
test:
    pnpm -r test

# Run SDK tests only
test-sdk:
    pnpm --filter gatana-sdk test

# Run CLI tests only
test-cli:
    pnpm --filter gatana test

# Regenerate API clients from OpenAPI specs
generate:
    pnpm --filter gatana-sdk generate

# Install all dependencies
install:
    pnpm install

# Format code with prettier
fmt:
    pnpm exec prettier --write .

# Check formatting without writing
fmt-check:
    pnpm exec prettier --check .

# Release with change detection (SDK auto-patches, CLI prompts)
release *ARGS:
    ./scripts/release.sh {{ARGS}}

# Release — force both packages even without changes
release-force *ARGS:
    ./scripts/release.sh --force {{ARGS}}

# Dry-run: build and pack both packages without publishing
pack:
    pnpm -r build
    cd packages/gatana-sdk && pnpm pack
    cd packages/gatana && pnpm pack

# Run the CLI directly via tsx (no build needed)
cli *ARGS:
    npx tsx packages/gatana/src/cli.ts {{ARGS}}

# Clean all build artifacts
clean:
    rm -rf packages/gatana-sdk/dist packages/gatana/dist
