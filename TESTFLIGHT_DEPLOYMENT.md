# TestFlight Deployment Guide

This guide walks you through deploying the Omnia mobile app to TestFlight for development testing.

## Prerequisites

1. ✅ EAS CLI installed (`eas` command available)
2. ✅ Logged into EAS (`eas whoami` shows your account)
3. ✅ Apple Developer account with App Store Connect access
4. ✅ App registered in App Store Connect with bundle ID: `com.omniatom.omniamobile`
5. ✅ Apple Team ID configured: `279PV9XKZ2`

## Step 1: Build for TestFlight

Build a production iOS app that can be submitted to TestFlight:

```bash
cd omnia-mobile
eas build --profile production --platform ios
```

**What happens:**
- EAS will build your app in the cloud
- The build will take 10-20 minutes
- You'll get a download link when complete
- The build will be automatically uploaded to App Store Connect

**Note:** The first time you build, EAS may ask you to:
- Set up credentials (Apple certificates, provisioning profiles)
- Choose whether to use EAS-managed credentials (recommended) or your own

## Step 2: Submit to TestFlight

After the build completes, submit it to TestFlight:

```bash
eas submit --profile production --platform ios
```

**What happens:**
- EAS will upload the build to App Store Connect
- The build will appear in TestFlight (may take a few minutes)
- You'll need to process the build in App Store Connect

## Step 3: Process Build in App Store Connect

1. Go to [App Store Connect](https://appstoreconnect.apple.com/)
2. Navigate to **My Apps** → **Omnia** (or your app name)
3. Go to **TestFlight** tab
4. Find your new build under "iOS Builds"
5. Click **Process** if needed (Apple processes the build automatically)
6. Wait for processing to complete (usually 5-15 minutes)

## Step 4: Add Testers

### Internal Testing (Immediate)
1. In TestFlight, go to **Internal Testing**
2. Click **+** to create a new group or use existing
3. Add internal testers (up to 100 people in your organization)
4. Select your build
5. Testers will receive an email invitation

### External Testing (Requires Beta Review)
1. Go to **External Testing**
2. Create a new group
3. Add external testers (up to 10,000)
4. Fill in required information:
   - What to Test
   - Beta App Description
   - Feedback Email
5. Submit for Beta App Review (first time only, takes 24-48 hours)
6. Once approved, testers can install via TestFlight

## Alternative: One-Command Build & Submit

You can build and submit in one go:

```bash
eas build --profile production --platform ios --auto-submit
```

This will:
1. Build the app
2. Automatically submit to App Store Connect when build completes
3. Skip the manual `eas submit` step

## Troubleshooting

### Build Fails
- Check that your Apple Team ID is correct in `app.json`
- Ensure you have proper permissions in App Store Connect
- Verify bundle identifier matches App Store Connect

### Submission Fails
- Make sure the app exists in App Store Connect
- Check that you have the "App Manager" or "Admin" role
- Verify your Apple Developer account is active

### Build Not Appearing in TestFlight
- Wait a few minutes for processing
- Check App Store Connect for any errors
- Ensure the build was submitted successfully (check `eas submit` output)

## Updating the Build

To push a new version:

1. Update version in `app.json` (or let `autoIncrement` handle it):
   ```json
   "version": "1.0.1"
   ```

2. Build and submit again:
   ```bash
   eas build --profile production --platform ios --auto-submit
   ```

## Development Build vs Production Build

- **Development Build** (`eas build --profile development`): For development with hot reload, requires Metro bundler
- **Production Build** (`eas build --profile production`): Standalone app for TestFlight/App Store, no Metro needed

For TestFlight testing, use the **production** profile.

## Quick Reference

```bash
# Build for TestFlight
eas build --profile production --platform ios

# Submit to TestFlight
eas submit --profile production --platform ios

# Build and submit in one command
eas build --profile production --platform ios --auto-submit

# Check build status
eas build:list

# View build details
eas build:view [BUILD_ID]
```

