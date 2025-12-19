# Device Limitations & Future Considerations

## Even Realities G1 Smart Glasses

### Current Implementation
The pick-pack flow is operational using Even Realities G1 smart glasses with BLE connectivity.

### Known Limitations

#### 1. Streaming Resolution
- Current video streaming resolution has constraints that may impact readability
- Barcode scanning works but resolution could be improved

#### 2. Battery Life
- Battery consumption during active use needs monitoring
- Dual-battery system (left and right) provides redundancy
- Case battery provides additional charging capability

#### 3. Usability Compared to Traditional Scanners
- Different ergonomics compared to dedicated barcode scanners
- Learning curve for operators transitioning from iPad/iPhone workflows
- Hands-free operation provides benefits but requires adjustment period

### Future Considerations

#### Even Realities G2 Model
When the G2 model becomes available, it may present a stronger case for:
- Complete replacement of iPad/iPhone workflows
- Improved hardware specifications
- Enhanced user experience
- Better integration with enterprise workflows

**Decision Point:** Evaluate G2 model upon receipt to determine if it addresses current G1 limitations and provides compelling value for full deployment.

## Meta Wearables SDK

### Documentation Reference
- Official Docs: https://wearables.developer.meta.com/docs
- Current implementation includes Meta SDK bridge for Ray-Ban glasses
- Alternative platform for future evaluation

### Capabilities
- Video streaming and photo capture
- Advanced camera features
- Device registration and pairing
- May offer different trade-offs vs Even Realities platform

---

## Technical Implementation Notes

### Device Telemetry Available
- ✅ Battery level (left, right, case)
- ✅ Connection state (BLE-based)
- ✅ Wear detection (glasses on/off)
- ✅ Charging status
- ✅ Touch events (tap, double-tap, long press)

### Reliability Improvements
- Real-time connection monitoring
- Automatic battery polling
- Activity state tracking via wear detection
- Signal strength (RSSI) monitoring

### Best Practices
- Follow dual-arm communication protocol (left first, then right)
- Implement sequence numbering for packet ordering
- Use periodic battery polling (5-10 minute intervals)
- Monitor connection quality via RSSI
- Handle disconnection events with automatic reconnection

---

**Last Updated:** 2025-12-18
