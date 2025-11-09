Omnia Mobile App - Design System Prompt

  Design Philosophy

  Modern glassmorphism with deep space purple theme. Dark, premium aesthetic with frosted glass effects, subtle gradients, and glowing purple
  accents. Clean, futuristic interface for enterprise AR/AI platform.

  Color Palette

  Primary Colors

  - Deep Purple (Background): #1A0C46 (rgba(26, 12, 70, 1))
  - Dark Purple (Secondary Background): #2E205A (rgba(46, 32, 90, 1))
  - Purple Accent: #6B4DFF (rgba(107, 77, 255, 1))
  - Light Purple: #A394FF (rgba(163, 148, 255, 1))
  - White: #FFFFFF (text, icons)
  - Light Gray: #DAD8E6 (rgba(218, 216, 230, 1)) - secondary text
  - Medium Gray: #9E9E9E (rgba(158, 158, 158, 1)) - disabled/muted

  Status Colors

  - Success/Online: #4CAF50 (rgba(76, 175, 80, 1))
  - Warning/Pending: #FFC107 (rgba(255, 193, 7, 1))
  - Error/Low Battery: #FF6B6B (rgba(255, 107, 107, 1))
  - Info: #FF9800 (rgba(255, 152, 0, 1)) - processing

  Border/Overlay Colors

  - Border Default: rgba(107, 77, 255, 0.3) - 30% opacity purple
  - Border Hover/Active: rgba(107, 77, 255, 0.6) - 60% opacity purple
  - Card Background: rgba(26, 12, 70, 0.6) - 60% opacity deep purple with blur
  - App Bar: rgba(26, 12, 70, 0.95) - 95% opacity

  Gradients

  Primary Gradient (Headings, Buttons)

  linear-gradient(135deg, #6E40FF 0%, #A394FF 100%)

  Text Gradient (Logo, Premium Text)

  linear-gradient(135deg, #FFFFFF 0%, #A394FF 100%)

  Card Background Gradient

  linear-gradient(135deg, rgba(26, 12, 70, 0.9) 0%, rgba(46, 32, 90, 0.9) 100%)

  Typography

  Font Weights

  - Regular: 400
  - Medium: 600
  - Bold: 700

  Text Hierarchy

  - Headings (H1-H3): #FFFFFF - white, bold
  - Body Text: #FFFFFF - white, regular
  - Secondary Text: #DAD8E6 - light gray
  - Muted/Disabled: #9E9E9E - medium gray
  - Accent Text: #A394FF - light purple
  - Monospace Code: Use system monospace font for codes, serial numbers

  Components

  Cards

  - Background: rgba(26, 12, 70, 0.6) with backdropFilter: blur(20px)
  - Border: 1px solid rgba(107, 77, 255, 0.3)
  - Border Radius: 8-12px
  - Hover: Border changes to rgba(107, 77, 255, 0.6), translateY(-2px to -4px)
  - Transition: all 0.3s ease

  Buttons

  Primary Button:
  - Background: linear-gradient(135deg, #6E40FF 0%, #A394FF 100%)
  - Text: #FFFFFF
  - Border Radius: 8px
  - Padding: 12px 24px
  - Font Weight: 600

  Outlined Button:
  - Border: 1px solid rgba(107, 77, 255, 0.6)
  - Text: #A394FF
  - Background: Transparent or rgba(107, 77, 255, 0.1)

  Disabled:
  - Opacity: 0.5

  Chips/Badges

  Status Chips:
  - Online: Background rgba(76, 175, 80, 0.2), Text #4CAF50, Border rgba(76, 175, 80, 0.4)
  - Offline: Background rgba(158, 158, 158, 0.2), Text #9E9E9E, Border rgba(158, 158, 158, 0.4)
  - Pending: Background rgba(255, 193, 7, 0.2), Text #FFC107, Border rgba(255, 193, 7, 0.4)
  - Processing: Background rgba(255, 152, 0, 0.2), Text #FF9800, Border rgba(255, 152, 0, 0.4)

  Device Type Chips:
  - Background: rgba(107, 77, 255, 0.2)
  - Text: #A394FF
  - Border: Optional rgba(107, 77, 255, 0.4)
  - Font Size: 12px (small)

  Persona Chips:
  - Background: rgba(163, 148, 255, 0.2)
  - Text: #FFFFFF
  - Border: rgba(163, 148, 255, 0.4)
  - Include PersonIcon

  Input Fields

  - Background: Transparent or rgba(26, 12, 70, 0.4)
  - Border: 1px solid rgba(107, 77, 255, 0.5)
  - Focus Border: rgba(107, 77, 255, 1) or #A394FF
  - Text: #FFFFFF
  - Placeholder: rgba(218, 216, 230, 0.5)
  - Border Radius: 8px

  Icons

  - Primary Icons: #A394FF (80px for empty states, 20-24px for UI)
  - Success Icons (Battery Full): #4CAF50
  - Warning Icons (Battery Low): #FF6B6B
  - Neutral Icons: #FFFFFF or #DAD8E6

  Avatars/Profile

  - Size: 40px
  - Background: linear-gradient(135deg, #6E40FF 0%, #A394FF 100%)
  - Border: 2px solid rgba(163, 148, 255, 0.3)
  - Hover Border: rgba(163, 148, 255, 0.6)

  Progress Bars

  - Background: rgba(107, 77, 255, 0.2)
  - Fill: #A394FF
  - Height: 6px
  - Border Radius: 3px

  Alerts/Notifications

  - Info: Background rgba(107, 77, 255, 0.1), Border rgba(107, 77, 255, 0.3)
  - Success: Background rgba(76, 175, 80, 0.1), Border rgba(76, 175, 80, 0.3)
  - Warning: Background rgba(255, 193, 7, 0.1), Border rgba(255, 193, 7, 0.3)
  - Error: Background rgba(255, 107, 107, 0.1), Border rgba(255, 107, 107, 0.3)

  Layout

  Spacing Scale

  - xs: 4px
  - sm: 8px
  - md: 16px
  - lg: 24px
  - xl: 32px
  - 2xl: 48px

  Screen Padding

  - Horizontal: 16-24px
  - Vertical: 16-32px

  Card Spacing

  - Margin between cards: 16-24px
  - Internal padding: 16-24px

  Effects

  Glassmorphism

  background: rgba(26, 12, 70, 0.6)
  backdropFilter: blur(20px)
  border: 1px solid rgba(107, 77, 255, 0.3)

  Hover/Press Effects

  - Scale: 0.98 on press
  - Translate: -2px to -4px on hover
  - Border: Increase opacity from 0.3 to 0.6
  - Shadow: 0 8px 24px rgba(107, 77, 255, 0.3) on hover

  Transitions

  - Standard: all 0.3s ease
  - Fast: all 0.2s ease

  React Native Specific

  Shadow (for iOS/Android cards)

  {
    shadowColor: '#6B4DFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8, // Android
  }

  Safe Area

  - Use SafeAreaView with background #1A0C46
  - StatusBar: light content, transparent background

  Navigation

  - Tab Bar: Background rgba(26, 12, 70, 0.95), blur effect
  - Active Tab: #A394FF
  - Inactive Tab: #9E9E9E
  - Indicator: linear-gradient(135deg, #6E40FF 0%, #A394FF 100%)

  Component Examples for Expo

  Device Status Card

  <View style={{
    background: 'linear-gradient(135deg, rgba(26, 12, 70, 0.9) 0%, rgba(46, 32, 90, 0.9) 100%)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(107, 77, 255, 0.3)',
    padding: 16,
  }}>
    {/* Battery indicator with #4CAF50 or #FF6B6B */}
    {/* Status chip with appropriate color */}
  </View>

  Chat Bubble

  // User message
  <View style={{
    backgroundColor: 'rgba(107, 77, 255, 0.3)',
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
    alignSelf: 'flex-end',
  }}>
    <Text style={{ color: '#FFFFFF' }}>Message text</Text>
  </View>

  // AI response
  <View style={{
    backgroundColor: 'rgba(26, 12, 70, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(107, 77, 255, 0.3)',
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
    alignSelf: 'flex-start',
  }}>
    <Text style={{ color: '#FFFFFF' }}>AI response</Text>
  </View>

  Primary Button

  <LinearGradient
    colors={['#6E40FF', '#A394FF']}
    start={{ x: 0, y: 0 }}
    end={{ x: 1, y: 1 }}
    style={{ borderRadius: 8, padding: 12 }}
  >
    <Text style={{ color: '#FFFFFF', fontWeight: '600', textAlign: 'center' }}>
      Button Text
    </Text>
  </LinearGradient>