import React from 'react';
import { View } from 'react-native';
import { HandPoseData } from '../services/metaWearables';

// Hand skeleton connections: pairs of joint names to draw bones between
const HAND_SKELETON_CONNECTIONS: [string, string][] = [
  // Thumb
  ['wrist', 'thumbCMC'], ['thumbCMC', 'thumbMP'], ['thumbMP', 'thumbIP'], ['thumbIP', 'thumbTip'],
  // Index finger
  ['wrist', 'indexMCP'], ['indexMCP', 'indexPIP'], ['indexPIP', 'indexDIP'], ['indexDIP', 'indexTip'],
  // Middle finger
  ['wrist', 'middleMCP'], ['middleMCP', 'middlePIP'], ['middlePIP', 'middleDIP'], ['middleDIP', 'middleTip'],
  // Ring finger
  ['wrist', 'ringMCP'], ['ringMCP', 'ringPIP'], ['ringPIP', 'ringDIP'], ['ringDIP', 'ringTip'],
  // Little finger
  ['wrist', 'littleMCP'], ['littleMCP', 'littlePIP'], ['littlePIP', 'littleDIP'], ['littleDIP', 'littleTip'],
  // Palm cross-connections
  ['indexMCP', 'middleMCP'], ['middleMCP', 'ringMCP'], ['ringMCP', 'littleMCP'],
];

const FINGERTIP_JOINTS = new Set(['thumbTip', 'indexTip', 'middleTip', 'ringTip', 'littleTip']);

const HandPoseOverlay = React.memo(({
  handPoseData,
  containerWidth,
  containerHeight,
}: {
  handPoseData: HandPoseData;
  containerWidth: number;
  containerHeight: number;
}) => {
  if (!containerWidth || !containerHeight) return null;

  const elements: React.ReactElement[] = [];
  let keyIdx = 0;

  for (const hand of handPoseData.hands) {
    const color = hand.chirality === 'left' ? '#22c55e' : hand.chirality === 'right' ? '#ef4444' : '#eab308';

    // Build joint lookup map
    const jointMap = new Map<string, { x: number; y: number; confidence: number }>();
    for (const joint of hand.joints) {
      if (joint.confidence >= 0.3) {
        jointMap.set(joint.name, joint);
      }
    }

    // Draw skeleton lines
    for (const [from, to] of HAND_SKELETON_CONNECTIONS) {
      const a = jointMap.get(from);
      const b = jointMap.get(to);
      if (!a || !b) continue;

      const x1 = a.x * containerWidth;
      const y1 = a.y * containerHeight;
      const x2 = b.x * containerWidth;
      const y2 = b.y * containerHeight;

      const dx = x2 - x1;
      const dy = y2 - y1;
      const length = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);

      elements.push(
        <View
          key={`line-${keyIdx++}`}
          style={{
            position: 'absolute',
            left: x1,
            top: y1,
            width: length,
            height: 2,
            backgroundColor: color,
            opacity: 0.7,
            transformOrigin: 'left center',
            transform: [{ rotate: `${angle}deg` }],
          }}
        />
      );
    }

    // Draw joint dots
    for (const [name, joint] of jointMap) {
      const isTip = FINGERTIP_JOINTS.has(name);
      const dotSize = isTip ? 10 : 6;
      const x = joint.x * containerWidth - dotSize / 2;
      const y = joint.y * containerHeight - dotSize / 2;

      elements.push(
        <View
          key={`dot-${keyIdx++}`}
          style={{
            position: 'absolute',
            left: x,
            top: y,
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
            backgroundColor: color,
            borderWidth: 1,
            borderColor: '#fff',
          }}
        />
      );
    }
  }

  return <>{elements}</>;
});

export default HandPoseOverlay;
