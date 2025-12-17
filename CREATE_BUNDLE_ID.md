# Creating Bundle ID in Apple Developer Portal

The error you're seeing is because the bundle identifier `com.omniatom.omniamobile` doesn't exist in your Apple Developer account yet.

## Option 1: Create Bundle ID via Apple Developer Portal (Recommended)

1. **Go to Apple Developer Portal:**
   - Visit: https://developer.apple.com/account/resources/identifiers/list
   - Log in with your Apple ID: `tom.shannon@theomnia.io`

2. **Create New Identifier:**
   - Click the **+** button (top left)
   - Select **App IDs** → Click **Continue**
   - Select **App** → Click **Continue**

3. **Enter Bundle ID Details:**
   - **Description:** Omnia Mobile
   - **Bundle ID:** Select **Explicit** and enter: `com.omniatom.omniamobile`
   - Click **Continue**

4. **Select Capabilities:**
   - Enable **Push Notifications** (if needed)
   - Enable **Background Modes** (for Bluetooth)
   - Click **Continue**

5. **Review and Register:**
   - Review the details
   - Click **Register**

## Option 2: Let EAS Create It (Easier)

EAS can create the bundle ID for you if you give it permission. When you run the build command again, it should prompt you to create the bundle ID automatically.

Try running the build again:
```bash
cd omnia-mobile
eas build --profile production --platform ios --auto-submit
```

If it asks about creating the bundle ID, say **yes**.

## Option 3: Create via App Store Connect

If you already have an app in App Store Connect:

1. Go to [App Store Connect](https://appstoreconnect.apple.com/)
2. Click **My Apps** → **+** (Create New App)
3. Fill in:
   - **Platform:** iOS
   - **Name:** Omnia
   - **Primary Language:** English
   - **Bundle ID:** Select or create `com.omniatom.omniamobile`
   - **SKU:** (any unique identifier, e.g., `omnia-mobile-001`)
4. Click **Create**

This will automatically create the bundle ID in Apple Developer Portal.

## After Creating the Bundle ID

Once the bundle ID is created, run the build command again:

```bash
cd omnia-mobile
eas build --profile production --platform ios --auto-submit
```

The build should now proceed successfully!

