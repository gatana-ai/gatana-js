#!/usr/bin/env bash
set -e

# ──────────────────────────────────────────────────────────────────────
# Gatana Release Script
#
# Detects which packages have changed, asks how to bump their versions,
# then builds, publishes to npm, and creates git tags.
#
# Usage:
#   ./scripts/release.sh                       Interactive mode (recommended)
#   ./scripts/release.sh --sdk-bump patch       Non-interactive SDK bump
#   ./scripts/release.sh --cli-bump minor       Non-interactive CLI bump
#   ./scripts/release.sh --force                Release even without changes
# ──────────────────────────────────────────────────────────────────────

BOLD="\033[1m"
DIM="\033[2m"
GREEN="\033[32m"
YELLOW="\033[33m"
CYAN="\033[36m"
RED="\033[31m"
RESET="\033[0m"

FORCE=false
SDK_BUMP=""
CLI_BUMP=""

usage() {
  echo ""
  echo -e "${BOLD}Gatana Release Script${RESET}"
  echo ""
  echo "Usage: ./scripts/release.sh [options]"
  echo ""
  echo "Options:"
  echo "  --force                Release even if no changes detected"
  echo "  --sdk-bump <level>     Set gatana-sdk bump level: patch, minor, or major"
  echo "  --cli-bump <level>     Set gatana CLI bump level: patch, minor, or major"
  echo "  -h, --help             Show this help"
  echo ""
  echo "If bump levels are not specified, the script will ask interactively."
  echo ""
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force) FORCE=true; shift ;;
    --sdk-bump) SDK_BUMP="$2"; shift 2 ;;
    --cli-bump) CLI_BUMP="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) echo -e "${RED}Unknown option: $1${RESET}"; usage ;;
  esac
done

for b in "$SDK_BUMP" "$CLI_BUMP"; do
  if [[ -n "$b" && "$b" != "patch" && "$b" != "minor" && "$b" != "major" ]]; then
    echo -e "${RED}Error: bump level must be patch, minor, or major (got '$b')${RESET}"
    exit 1
  fi
done

# ── Helpers ───────────────────────────────────────────────────────────

latest_tag() {
  local prefix="$1"
  git tag --list "${prefix}@*" --sort=-v:refname | head -n1
}

has_changes() {
  local tag="$1"
  local dir="$2"
  if [[ -z "$tag" ]]; then
    return 0 # no previous tag = always has changes
  fi
  [[ -n "$(git diff --name-only "$tag" -- "$dir")" ]]
}

# Extract version from a tag like "gatana-sdk@2.1.3" → "2.1.3"
version_from_tag() {
  echo "$1" | sed 's/.*@//'
}

# Compute what the next version would be for a given bump
next_version() {
  local current="$1"
  local bump="$2"
  local major minor patch
  IFS='.' read -r major minor patch <<< "$current"
  case "$bump" in
    major) echo "$((major + 1)).0.0" ;;
    minor) echo "${major}.$((minor + 1)).0" ;;
    patch) echo "${major}.${minor}.$((patch + 1))" ;;
  esac
}

ask_bump() {
  local pkg="$1"
  local current_tag="$2"
  local current_version=""

  if [[ -n "$current_tag" ]]; then
    current_version=$(version_from_tag "$current_tag")
  else
    # Read from package.json
    if [[ "$pkg" == "gatana-sdk" ]]; then
      current_version=$(node -p "require('./packages/gatana-sdk/package.json').version")
    else
      current_version=$(node -p "require('./packages/gatana/package.json').version")
    fi
  fi

  echo "" >&2
  echo -e "${BOLD}Version bump for ${CYAN}${pkg}${RESET}${BOLD}?${RESET}  ${DIM}(current: ${current_version})${RESET}" >&2
  echo "" >&2

  local patch_v minor_v major_v
  patch_v=$(next_version "$current_version" "patch")
  minor_v=$(next_version "$current_version" "minor")
  major_v=$(next_version "$current_version" "major")

  echo -e "  ${GREEN}1)${RESET} patch  →  ${current_version} → ${BOLD}${patch_v}${RESET}  ${DIM}(bug fixes, safe changes)${RESET}" >&2
  echo -e "  ${YELLOW}2)${RESET} minor  →  ${current_version} → ${BOLD}${minor_v}${RESET}  ${DIM}(new features, backwards compatible)${RESET}" >&2
  echo -e "  ${RED}3)${RESET} major  →  ${current_version} → ${BOLD}${major_v}${RESET}  ${DIM}(breaking changes)${RESET}" >&2
  echo -e "  ${DIM}4) skip   (don't release this package)${RESET}" >&2
  echo "" >&2
  read -rp "  Choose [1]: " choice
  case "$choice" in
    2) echo "minor" ;;
    3) echo "major" ;;
    4) echo "skip" ;;
    *) echo "patch" ;;
  esac
}

confirm_release() {
  echo ""
  echo -e "${BOLD}────────────────────────────────────────${RESET}"
  echo -e "${BOLD}  Release Summary${RESET}"
  echo -e "${BOLD}────────────────────────────────────────${RESET}"

  if [[ "$RELEASE_SDK" == true ]]; then
    local sdk_cur sdk_next
    sdk_cur=$(node -p "require('./packages/gatana-sdk/package.json').version")
    sdk_next=$(next_version "$sdk_cur" "$SDK_BUMP")
    echo -e "  ${CYAN}gatana-sdk${RESET}  ${sdk_cur} → ${GREEN}${sdk_next}${RESET}  (${SDK_BUMP})"
  fi
  if [[ "$RELEASE_CLI" == true ]]; then
    local cli_cur cli_next
    cli_cur=$(node -p "require('./packages/gatana/package.json').version")
    cli_next=$(next_version "$cli_cur" "$CLI_BUMP")
    echo -e "  ${CYAN}gatana${RESET}      ${cli_cur} → ${GREEN}${cli_next}${RESET}  (${CLI_BUMP})"
  fi

  echo -e "${BOLD}────────────────────────────────────────${RESET}"
  echo ""
  echo "  This will: bump versions, build, publish to npm, commit & tag."
  echo ""
  read -rp "  Proceed? [Y/n]: " confirm
  case "$confirm" in
    [nN]*) echo ""; echo "Aborted."; exit 0 ;;
  esac
}

step() {
  echo ""
  echo -e "${BOLD}▸ $1${RESET}"
}

# ── Detect changes ────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}Gatana Release${RESET}"
echo ""

SDK_TAG=$(latest_tag "gatana-sdk")
CLI_TAG=$(latest_tag "gatana")

SDK_CHANGED=false
CLI_CHANGED=false

if has_changes "$SDK_TAG" "packages/gatana-sdk"; then
  SDK_CHANGED=true
  echo -e "  ${GREEN}●${RESET} ${BOLD}gatana-sdk${RESET}  has changes since ${DIM}${SDK_TAG:-first release}${RESET}"
else
  echo -e "  ${DIM}○ gatana-sdk  no changes since ${SDK_TAG}${RESET}"
fi

if has_changes "$CLI_TAG" "packages/gatana"; then
  CLI_CHANGED=true
  echo -e "  ${GREEN}●${RESET} ${BOLD}gatana${RESET}      has changes since ${DIM}${CLI_TAG:-first release}${RESET}"
else
  echo -e "  ${DIM}○ gatana      no changes since ${CLI_TAG}${RESET}"
fi

# ── Determine what to release ─────────────────────────────────────────

RELEASE_SDK=false
RELEASE_CLI=false

if [[ "$SDK_CHANGED" == true || "$FORCE" == true ]]; then
  RELEASE_SDK=true
  if [[ -z "$SDK_BUMP" ]]; then
    SDK_BUMP=$(ask_bump "gatana-sdk" "$SDK_TAG")
  fi
  if [[ "$SDK_BUMP" == "skip" ]]; then
    RELEASE_SDK=false
  fi
fi

if [[ "$CLI_CHANGED" == true || "$FORCE" == true ]]; then
  RELEASE_CLI=true
  if [[ -z "$CLI_BUMP" ]]; then
    CLI_BUMP=$(ask_bump "gatana" "$CLI_TAG")
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

# ── Confirm before proceeding ─────────────────────────────────────────

confirm_release

# ── Bump versions ─────────────────────────────────────────────────────

if [[ "$RELEASE_SDK" == true ]]; then
  step "Bumping gatana-sdk version (${SDK_BUMP})..."
  pnpm --filter gatana-sdk exec pnpm version "$SDK_BUMP" --no-git-tag-version --no-git-checks
fi

if [[ "$RELEASE_CLI" == true ]]; then
  step "Bumping gatana version (${CLI_BUMP})..."
  pnpm --filter gatana exec pnpm version "$CLI_BUMP" --no-git-tag-version --no-git-checks
fi

SDK_VERSION=$(node -p "require('./packages/gatana-sdk/package.json').version")
CLI_VERSION=$(node -p "require('./packages/gatana/package.json').version")

# ── Build ─────────────────────────────────────────────────────────────

if [[ "$RELEASE_SDK" == true ]]; then
  step "Building gatana-sdk..."
  pnpm --filter gatana-sdk build
fi
if [[ "$RELEASE_CLI" == true ]]; then
  step "Building gatana..."
  pnpm --filter gatana build
fi

# ── Publish ───────────────────────────────────────────────────────────

if [[ "$RELEASE_SDK" == true ]]; then
  step "Publishing gatana-sdk@${SDK_VERSION} to npm..."
  pnpm --filter gatana-sdk publish --access public --no-git-checks
fi
if [[ "$RELEASE_CLI" == true ]]; then
  step "Publishing gatana@${CLI_VERSION} to npm..."
  pnpm --filter gatana publish --access public --no-git-checks
fi

# ── Git commit & tag ──────────────────────────────────────────────────

step "Creating git commit and tags..."

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
git commit -S -m "release: ${MSG_PARTS[*]}"

for tag in "${TAGS[@]}"; do
  git tag -s "$tag" -m "Release ${tag}"
done

# ── Push ──────────────────────────────────────────────────────────────

step "Pushing to remote..."
git push
git push --tags

# ── GitHub Releases ───────────────────────────────────────────────────

if ! command -v gh &>/dev/null; then
  echo ""
  echo -e "${YELLOW}Warning: 'gh' CLI not found — skipping GitHub release creation.${RESET}"
  echo -e "${DIM}  Install it with: brew install gh${RESET}"
else
  step "Creating GitHub releases..."

  generate_notes() {
    local tag="$1"
    local prev_tag="$2"
    local pkg_dir="$3"

    if [[ -n "$prev_tag" ]]; then
      # Get commits between the two tags scoped to the package directory
      git log --pretty=format:"- %s (%h)" "${prev_tag}..${tag}" -- "$pkg_dir"
    else
      # First release — list all commits touching this package
      git log --pretty=format:"- %s (%h)" "${tag}" -- "$pkg_dir" | head -20
    fi
  }

  if [[ "$RELEASE_SDK" == true ]]; then
    SDK_NOTES=$(generate_notes "gatana-sdk@$SDK_VERSION" "$SDK_TAG" "packages/gatana-sdk")
    if [[ -z "$SDK_NOTES" ]]; then
      SDK_NOTES="Release gatana-sdk@${SDK_VERSION}"
    fi
    echo -e "  Creating release for ${CYAN}gatana-sdk@${SDK_VERSION}${RESET}..."
    gh release create "gatana-sdk@$SDK_VERSION" \
      --title "gatana-sdk@$SDK_VERSION" \
      --notes "$SDK_NOTES"
  fi

  if [[ "$RELEASE_CLI" == true ]]; then
    CLI_NOTES=$(generate_notes "gatana@$CLI_VERSION" "$CLI_TAG" "packages/gatana")
    if [[ -z "$CLI_NOTES" ]]; then
      CLI_NOTES="Release gatana@${CLI_VERSION}"
    fi
    echo -e "  Creating release for ${CYAN}gatana@${CLI_VERSION}${RESET}..."
    gh release create "gatana@$CLI_VERSION" \
      --title "gatana@$CLI_VERSION" \
      --notes "$CLI_NOTES"
  fi
fi

# ── Done ──────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}${BOLD}✓ Release complete!${RESET}"
echo ""
for tag in "${TAGS[@]}"; do
  echo -e "  ${CYAN}${tag}${RESET}"
done
echo ""
