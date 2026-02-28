#!/usr/bin/env bash
set -e

FORCE=false
SDK_BUMP=""
CLI_BUMP=""

usage() {
  echo "Usage: ./scripts/release.sh [--force] [--sdk-bump patch|minor|major] [--cli-bump patch|minor|major]"
  echo ""
  echo "Options:"
  echo "  --force       Release even if no changes detected"
  echo "  --sdk-bump    Override gatana-sdk bump level (default: patch)"
  echo "  --cli-bump    Override gatana CLI bump level (default: asks)"
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force) FORCE=true; shift ;;
    --sdk-bump) SDK_BUMP="$2"; shift 2 ;;
    --cli-bump) CLI_BUMP="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

for b in "$SDK_BUMP" "$CLI_BUMP"; do
  if [[ -n "$b" && "$b" != "patch" && "$b" != "minor" && "$b" != "major" ]]; then
    echo "Error: bump level must be patch, minor, or major (got '$b')"
    exit 1
  fi
done

# Find the latest tag for a package, e.g. "gatana-sdk@2.1.3" → "gatana-sdk@2.1.3"
latest_tag() {
  local prefix="$1"
  git tag --list "${prefix}@*" --sort=-v:refname | head -n1
}

# Check if there are changes in a directory since a tag
has_changes() {
  local tag="$1"
  local dir="$2"
  if [[ -z "$tag" ]]; then
    return 0 # no previous tag = always has changes
  fi
  [[ -n "$(git diff --name-only "$tag" -- "$dir")" ]]
}

ask_bump() {
  local pkg="$1"
  echo ""
  echo "What version bump for $pkg?"
  echo "  1) patch (default)"
  echo "  2) minor"
  echo "  3) major"
  echo "  4) skip"
  read -rp "Choice [1]: " choice
  case "$choice" in
    2) echo "minor" ;;
    3) echo "major" ;;
    4) echo "skip" ;;
    *) echo "patch" ;;
  esac
}

# --- Detect changes ---

SDK_TAG=$(latest_tag "gatana-sdk")
CLI_TAG=$(latest_tag "gatana")

echo "Last SDK release: ${SDK_TAG:-none}"
echo "Last CLI release: ${CLI_TAG:-none}"
echo ""

SDK_CHANGED=false
CLI_CHANGED=false

if has_changes "$SDK_TAG" "packages/gatana-sdk"; then
  SDK_CHANGED=true
  echo "gatana-sdk: changes detected since $SDK_TAG"
else
  echo "gatana-sdk: no changes since $SDK_TAG"
fi

if has_changes "$CLI_TAG" "packages/gatana"; then
  CLI_CHANGED=true
  echo "gatana:     changes detected since $CLI_TAG"
else
  echo "gatana:     no changes since $CLI_TAG"
fi

# --- Determine what to release ---

RELEASE_SDK=false
RELEASE_CLI=false

if [[ "$SDK_CHANGED" == true || "$FORCE" == true ]]; then
  RELEASE_SDK=true
  SDK_BUMP="${SDK_BUMP:-patch}"
fi

if [[ "$CLI_CHANGED" == true || "$FORCE" == true ]]; then
  RELEASE_CLI=true
  if [[ -z "$CLI_BUMP" ]]; then
    CLI_BUMP=$(ask_bump "gatana")
  fi
  if [[ "$CLI_BUMP" == "skip" ]]; then
    RELEASE_CLI=false
  fi
fi

if [[ "$RELEASE_SDK" == false && "$RELEASE_CLI" == false ]]; then
  echo ""
  echo "Nothing to release."
  exit 0
fi

# --- Bump versions ---

if [[ "$RELEASE_SDK" == true ]]; then
  echo ""
  echo "Bumping gatana-sdk ($SDK_BUMP)..."
  pnpm --filter gatana-sdk exec pnpm version "$SDK_BUMP" --no-git-tag-version
fi

if [[ "$RELEASE_CLI" == true ]]; then
  echo ""
  echo "Bumping gatana ($CLI_BUMP)..."
  pnpm --filter gatana exec pnpm version "$CLI_BUMP" --no-git-tag-version
fi

SDK_VERSION=$(node -p "require('./packages/gatana-sdk/package.json').version")
CLI_VERSION=$(node -p "require('./packages/gatana/package.json').version")

echo ""
echo "Versions:"
[[ "$RELEASE_SDK" == true ]] && echo "  gatana-sdk: $SDK_VERSION"
[[ "$RELEASE_CLI" == true ]] && echo "  gatana:     $CLI_VERSION"

# --- Build ---

echo ""
echo "Building..."
if [[ "$RELEASE_SDK" == true ]]; then
  pnpm --filter gatana-sdk build
fi
if [[ "$RELEASE_CLI" == true ]]; then
  pnpm --filter gatana build
fi

# --- Publish ---

echo ""
echo "Publishing..."
if [[ "$RELEASE_SDK" == true ]]; then
  pnpm --filter gatana-sdk publish --access public --no-git-checks
fi
if [[ "$RELEASE_CLI" == true ]]; then
  pnpm --filter gatana publish --access public --no-git-checks
fi

# --- Git commit & tag ---

echo ""
echo "Committing and tagging..."

FILES_TO_ADD=()
TAGS=()
MSG_PARTS=()

if [[ "$RELEASE_SDK" == true ]]; then
  FILES_TO_ADD+=(packages/gatana-sdk/package.json)
  TAGS+=("gatana-sdk@$SDK_VERSION")
  MSG_PARTS+=("gatana-sdk@$SDK_VERSION")
fi
if [[ "$RELEASE_CLI" == true ]]; then
  FILES_TO_ADD+=(packages/gatana/package.json)
  TAGS+=("gatana@$CLI_VERSION")
  MSG_PARTS+=("gatana@$CLI_VERSION")
fi

git add "${FILES_TO_ADD[@]}"
git commit -m "release: ${MSG_PARTS[*]}"

for tag in "${TAGS[@]}"; do
  git tag "$tag"
done

echo ""
echo "Done! Don't forget to push:"
echo "  git push && git push --tags"
