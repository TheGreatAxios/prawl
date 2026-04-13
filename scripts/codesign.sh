#!/bin/bash
#
# Code Signing Script for prawl - macOS Distribution
# ================================================
# 
# This script handles complete code signing workflow for macOS:
# 1. Ad-hoc signing (for local testing)
# 2. Developer ID signing (for distribution)
# 3. Notarization (for Gatekeeper compliance)
# 4. Stapling (embedding notarization ticket)
#
# Prerequisites:
# - Apple Developer Account ($99/year)
# - Developer ID Application certificate
# - App-specific password for notarization
# - Xcode Command Line Tools
#
# Usage:
#   ./scripts/codesign.sh [mode] [options]
#
# Modes:
#   adhoc       - Ad-hoc signing for local use only
#   developer   - Developer ID signing (requires APPLE_TEAM_ID)
#   notarize    - Full workflow: sign + notarize + staple (requires all env vars)
#   verify      - Verify current signing status
#
# Environment Variables:
#   APPLE_TEAM_ID           - Your Apple Developer Team ID (10 characters)
#   APPLE_ID                - Your Apple ID email
#   APPLE_APP_PASSWORD      - App-specific password for notarization
#   KEYCHAIN_PROFILE        - Keychain profile name (default: AC_PASSWORD)
#   BINARY_NAME             - Name of binary to sign (default: prawl)
#   BINARY_PATH             - Path to binary (default: ./prawl)
#
# Examples:
#   # Ad-hoc signing for local testing
#   ./scripts/codesign.sh adhoc
#
#   # Developer ID signing only
#   APPLE_TEAM_ID=XXXXXXXXXX ./scripts/codesign.sh developer
#
#   # Full notarization workflow
#   APPLE_TEAM_ID=XXXXXXXXXX APPLE_ID=dev@example.com APPLE_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx ./scripts/codesign.sh notarize
#

set -euo pipefail

# ============================================
# Credential Loading (.env file OR keychain)
# ============================================

# Load from .env file if it exists
if [[ -f .env ]]; then
    echo "[INFO] Loading credentials from .env file..."
    set -a
    source .env
    set +a
fi

# Try to load from keychain if env vars are still not set
load_keychain_creds() {
    if command -v xcrun &> /dev/null; then
        # Try to get Apple ID from keychain
        if [[ -z "${APPLE_ID:-}" ]]; then
            APPLE_ID=$(security find-generic-password -s "notarytool-$KEYCHAIN_PROFILE" -a "apple-id" 2>/dev/null || echo "")
        fi
        # Note: APPLE_TEAM_ID and APPLE_APP_PASSWORD should come from env or .env
        # as they're needed for notarytool submit
    fi
}

# If credentials still not loaded, try keychain as fallback
if [[ -z "${APPLE_ID:-}" ]] || [[ -z "${APPLE_TEAM_ID:-}" ]]; then
    # Set default before keychain function
    KEYCHAIN_PROFILE="${KEYCHAIN_PROFILE:-AC_PASSWORD}"
    load_keychain_creds
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BINARY_NAME="${BINARY_NAME:-prawl}"
BINARY_PATH="${BINARY_PATH:-./${BINARY_NAME}}"
ENTITLEMENTS_PATH="${ENTITLEMENTS_PATH:-./scripts/entitlements.plist}"
KEYCHAIN_PROFILE="${KEYCHAIN_PROFILE:-AC_PASSWORD}"
NOTARIZATION_TIMEOUT="${NOTARIZATION_TIMEOUT:-600}"  # 10 minutes default

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Change to project root
cd "$PROJECT_ROOT"

# ============================================
# Helper Functions
# ============================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

die() {
    log_error "$1"
    exit 1
}

# Check if running on macOS
check_macos() {
    if [[ "$OSTYPE" != "darwin"* ]]; then
        die "This script must be run on macOS"
    fi
}

# Check for required tools
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check for codesign
    if ! command -v codesign &> /dev/null; then
        die "codesign not found. Install Xcode Command Line Tools: xcode-select --install"
    fi
    
    # Check for notarytool
    if ! command -v xcrun &> /dev/null; then
        die "xcrun not found. Install Xcode Command Line Tools: xcode-select --install"
    fi
    
    # Check for binary
    if [[ ! -f "$BINARY_PATH" ]]; then
        die "Binary not found at $BINARY_PATH. Run 'bun run compile' first."
    fi
    
    log_success "Prerequisites check passed"
}

# Create entitlements file if it doesn't exist
create_entitlements() {
    if [[ -f "$ENTITLEMENTS_PATH" ]]; then
        log_info "Using existing entitlements: $ENTITLEMENTS_PATH"
        return 0
    fi
    
    log_info "Creating entitlements file..."
    
    mkdir -p "$(dirname "$ENTITLEMENTS_PATH")"
    
    cat > "$ENTITLEMENTS_PATH" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <!-- JIT Compilation - Required for Bun runtime -->
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    
    <!-- Allow unsigned executable memory -->
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    
    <!-- Disable executable page protection -->
    <key>com.apple.security.cs.disable-executable-page-protection</key>
    <true/>
    
    <!-- Allow DYLD environment variables -->
    <key>com.apple.security.cs.allow-dyld-environment-variables</key>
    <true/>
    
    <!-- Disable library validation -->
    <key>com.apple.security.cs.disable-library-validation</key>
    <true/>
    
    <!-- Hardened Runtime - Network Client -->
    <key>com.apple.security.network.client</key>
    <true/>
    
    <!-- Hardened Runtime - Network Server (for HTTP API) -->
    <key>com.apple.security.network.server</key>
    <true/>
</dict>
</plist>
EOF
    
    log_success "Created entitlements: $ENTITLEMENTS_PATH"
}

# ============================================
# Signing Functions
# ============================================

sign_adhoc() {
    log_info "Performing ad-hoc signing..."
    log_info "Target: $BINARY_PATH"
    
    # Ad-hoc signing (-) - no identity required, only valid on local machine
    codesign --force --deep --sign - \
        --entitlements "$ENTITLEMENTS_PATH" \
        "$BINARY_PATH"
    
    log_success "Ad-hoc signing complete"
    echo ""
    log_warning "Note: Ad-hoc signed binaries only work on this machine."
    log_warning "For distribution, use Developer ID signing."
}

sign_developer_id() {
    log_info "Performing Developer ID signing..."
    
    # Check for team ID
    if [[ -z "${APPLE_TEAM_ID:-}" ]]; then
        die "APPLE_TEAM_ID not set. Get your Team ID from https://developer.apple.com/account"
    fi
    
    log_info "Team ID: $APPLE_TEAM_ID"
    log_info "Target: $BINARY_PATH"
    
    # Find the Developer ID certificate
    local cert_name
    cert_name=$(security find-identity -v -p codesigning | grep "Developer ID Application" | head -1 | sed -E 's/.*"([^"]+)".*/\1/')
    
    if [[ -z "$cert_name" ]]; then
        echo ""
        log_error "No Developer ID Application certificate found"
        echo ""
        echo "To create one:"
        echo "  1. Go to https://developer.apple.com/account/resources/certificates/list"
        echo "  2. Click '+' to add a new certificate"
        echo "  3. Select 'Developer ID Application'"
        echo "  4. Follow the instructions to create and download"
        echo "  5. Double-click the .cer file to install to Keychain"
        echo ""
        exit 1
    fi
    
    log_info "Using certificate: $cert_name"
    
    # Sign with Developer ID
    codesign --deep --force \
        -vvvv \
        --sign "$cert_name" \
        --entitlements "$ENTITLEMENTS_PATH" \
        --timestamp \
        --options runtime \
        "$BINARY_PATH"
    
    log_success "Developer ID signing complete"
}

# ============================================
# Notarization Functions
# ============================================

notarize() {
    log_info "Starting notarization process..."
    
    # Validate required environment variables
    if [[ -z "${APPLE_ID:-}" ]]; then
        die "APPLE_ID not set. Use your Apple ID email."
    fi
    
    if [[ -z "${APPLE_APP_PASSWORD:-}" ]]; then
        die "APPLE_APP_PASSWORD not set. Create an app-specific password at https://appleid.apple.com"
    fi
    
    if [[ -z "${APPLE_TEAM_ID:-}" ]]; then
        die "APPLE_TEAM_ID not set. Get your Team ID from https://developer.apple.com/account"
    fi
    
    log_info "Apple ID: $APPLE_ID"
    log_info "Team ID: $APPLE_TEAM_ID"
    log_info "Binary: $BINARY_PATH"
    
    # Check if already signed with Developer ID
    local signer
    signer=$(codesign -d -vv "$BINARY_PATH" 2>&1 | grep "Authority" | head -1 || true)
    if [[ ! "$signer" =~ "Developer ID" ]]; then
        log_warning "Binary not signed with Developer ID. Signing first..."
        sign_developer_id
    fi
    
    # Create a ZIP for notarization
    local zip_path="${BINARY_PATH}.zip"
    log_info "Creating ZIP archive for notarization: $zip_path"
    
    # Remove old zip if exists
    rm -f "$zip_path"
    
    # Create zip with ditto (preserves metadata better)
    ditto -c -k --keepParent "$BINARY_PATH" "$zip_path"
    
    log_info "Submitting for notarization..."
    
    # Submit for notarization
    local output
    if ! output=$(xcrun notarytool submit "$zip_path" \
        --apple-id "$APPLE_ID" \
        --password "$APPLE_APP_PASSWORD" \
        --team-id "$APPLE_TEAM_ID" \
        --wait \
        --timeout "$NOTARIZATION_TIMEOUT" 2>&1); then
        
        log_error "Notarization submission failed"
        echo "$output"
        rm -f "$zip_path"
        exit 1
    fi
    
    echo "$output"
    
    # Check for success
    if [[ "$output" =~ "status: Accepted" ]] || [[ "$output" =~ "Accepted" ]]; then
        log_success "Notarization accepted!"
    else
        log_error "Notarization failed or timed out"
        echo "$output"
        rm -f "$zip_path"
        exit 1
    fi
    
    # Cleanup zip
    rm -f "$zip_path"
    
    # Staple the ticket
    staple
}

staple() {
    log_info "Stapling notarization ticket to binary..."
    
    xcrun stapler staple "$BINARY_PATH"
    
    log_success "Stapling complete"
    
    # Verify stapling
    log_info "Verifying stapled ticket..."
    xcrun stapler validate "$BINARY_PATH"
}

# ============================================
# Verification Functions
# ============================================

verify_signature() {
    log_info "Verifying code signature..."
    
    echo ""
    echo "=== Code Signature Verification ==="
    codesign -vvv --verify "$BINARY_PATH" 2>&1 || true
    
    echo ""
    echo "=== Signature Details ==="
    codesign -d -vv "$BINARY_PATH" 2>&1 || true
    
    echo ""
    echo "=== Hardened Runtime Check ==="
    codesign -d --entitlements - "$BINARY_PATH" 2>&1 || true
    
    echo ""
    echo "=== Notarization Status ==="
    spctl -a -vv -t install "$BINARY_PATH" 2>&1 || true
}

# ============================================
# Setup Functions
# ============================================

setup_keychain() {
    log_info "Setting up notarytool keychain profile..."
    
    if [[ -z "${APPLE_ID:-}" ]]; then
        die "APPLE_ID not set"
    fi
    
    if [[ -z "${APPLE_APP_PASSWORD:-}" ]]; then
        die "APPLE_APP_PASSWORD not set"
    fi
    
    if [[ -z "${APPLE_TEAM_ID:-}" ]]; then
        die "APPLE_TEAM_ID not set"
    fi
    
    # Store credentials in keychain
    xcrun notarytool store-credentials "$KEYCHAIN_PROFILE" \
        --apple-id "$APPLE_ID" \
        --password "$APPLE_APP_PASSWORD" \
        --team-id "$APPLE_TEAM_ID" \
        --validate
    
    log_success "Keychain profile '$KEYCHAIN_PROFILE' configured"
    log_info "You can now use: xcrun notarytool submit <file> --keychain-profile $KEYCHAIN_PROFILE --wait"
}

# ============================================
# Main
# ============================================

show_help() {
    cat << 'EOF'
prawl macOS Code Signing Tool

Sign and notarize prawl binary for macOS distribution.

USAGE:
    ./scripts/codesign.sh <command> [options]

COMMANDS:
    adhoc       Ad-hoc signing for local use only (no Apple Developer required)
    developer   Developer ID signing for distribution (requires APPLE_TEAM_ID)
    notarize    Full workflow: sign + notarize + staple (requires all credentials)
    staple      Staple existing notarization ticket
    verify      Verify current signing and notarization status
    setup       Configure notarytool keychain profile
    help        Show this help message

ENVIRONMENT VARIABLES:
    APPLE_TEAM_ID           Your Apple Developer Team ID (10 characters)
    APPLE_ID                Your Apple ID email address
    APPLE_APP_PASSWORD      App-specific password for notarization
    KEYCHAIN_PROFILE        Keychain profile name (default: AC_PASSWORD)
    BINARY_NAME             Name of binary (default: prawl)
    BINARY_PATH             Path to binary (default: ./prawl)

EXAMPLES:
    # Ad-hoc signing (local only)
    ./scripts/codesign.sh adhoc

    # Developer ID signing
    APPLE_TEAM_ID=XXXXXXXXXX ./scripts/codesign.sh developer

    # Full notarization workflow
    APPLE_TEAM_ID=XXXXXXXXXX APPLE_ID=dev@example.com APPLE_APP_PASSWORD=abcd-efgh-ijkl-mnop ./scripts/codesign.sh notarize

    # Setup keychain profile (one-time)
    APPLE_TEAM_ID=XXXXXXXXXX APPLE_ID=dev@example.com APPLE_APP_PASSWORD=abcd-efgh-ijkl-mnop ./scripts/codesign.sh setup

    # Verify binary
    ./scripts/codesign.sh verify

PREREQUISITES:
    1. Apple Developer Account ($99/year)
    2. Xcode Command Line Tools: xcode-select --install
    3. Developer ID Application certificate from Apple Developer portal

GETTING STARTED:
    1. Join Apple Developer Program: https://developer.apple.com/programs/
    2. Get your Team ID: https://developer.apple.com/account (Membership details)
    3. Create Developer ID cert: https://developer.apple.com/account/resources/certificates/list
    4. Generate app-specific password: https://appleid.apple.com (Security → App-Specific Passwords)
    5. Run: ./scripts/codesign.sh setup (to store credentials)
    6. Run: ./scripts/codesign.sh notarize

For more information: https://developer.apple.com/documentation/xcode/notarizing_macos_software_before_distribution
EOF
}

main() {
    local command="${1:-help}"
    
    # Always check macOS first
    check_macos
    
    case "$command" in
        adhoc)
            check_prerequisites
            create_entitlements
            sign_adhoc
            verify_signature
            ;;
        developer)
            check_prerequisites
            create_entitlements
            sign_developer_id
            verify_signature
            ;;
        notarize)
            check_prerequisites
            create_entitlements
            notarize
            verify_signature
            log_success "✅ Binary ready for distribution!"
            ;;
        staple)
            check_prerequisites
            staple
            ;;
        verify)
            check_prerequisites
            verify_signature
            ;;
        setup)
            setup_keychain
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            log_error "Unknown command: $command"
            show_help
            exit 1
            ;;
    esac
}

main "$@"
