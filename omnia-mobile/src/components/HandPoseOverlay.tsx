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

/** Map normalized frame coords (0-1) to container coords. Handles cover mode when frame aspect differs. */
function frameToContainer(
  fx: number, fy: number,
  containerW: number, containerH: number,
  frameW: number, frameH: number
): { x: number; y: number } {
  if (!frameW || !frameH || frameW === containerW) {
    return { x: fx * containerW, y: fy * containerH };
  }
  const scale = Math.max(containerW / frameW, containerH / frameH);
  const dispW = frameW * scale;
  const dispH = frameH * scale;
  const offX = (containerW - dispW) / 2;
  const offY = (containerH - dispH) / 2;
  return {
    x: offX + fx * dispW,
    y: offY + fy * dispH,
  };
}

const HandPoseOverlay = React.memo(({
  handPoseData,
  containerWidth,
  containerHeight,
  frameWidth,
  frameHeight,
}: {
  handPoseData: HandPoseData;
  containerWidth: number;
  containerHeight: number;
  frameWidth?: number;
  frameHeight?: number;
}) => {
  if (!containerWidth || !containerHeight) return null;

  const fw = frameWidth ?? containerWidth;
  const fh = frameHeight ?? containerHeight;
  const toScreen = (fx: number, fy: number) =>
    frameToContainer(fx, fy, containerWidth, containerHeight, fw, fh);

  const elements: React.ReactElement[] = [];
  let keyIdx = 0;

  for (const hand of handPoseData.hands) {
    const color = hand.chirality === 'left' ? '#22c55e' : hand.chirality === 'right' ? '#ef4444' : '#eab308';

    const jointMap = new Map<string, { x: number; y: number; confidence: number }>();
    for (const joint of hand.joints) {
      if (joint.confidence >= 0.3) {
        jointMap.set(joint.name, joint);
      }
    }

    for (const [from, to] of HAND_SKELETON_CONNECTIONS) {
      const a = jointMap.get(from);
      const b = jointMap.get(to);
      if (!a || !b) continue;

      const p1 = toScreen(a.x, a.y);
      const p2 = toScreen(b.x, b.y);
      const x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;

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
            height: 5,
            backgroundColor: color,
            opacity: 0.95,
            transformOrigin: 'left center',
            transform: [{ rotate: `${angle}deg` }],
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.5,
            shadowRadius: 2,
            elevation: 4,
          }}
        />
      );
    }

    // Draw joint dots
    for (const [name, joint] of jointMap) {
      const isTip = FINGERTIP_JOINTS.has(name);
      const dotSize = isTip ? 16 : 10;
      const p = toScreen(joint.x, joint.y);
      const x = p.x - dotSize / 2;
      const y = p.y - dotSize / 2;

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
            borderWidth: 2,
            borderColor: '#fff',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.6,
            shadowRadius: 2,
            elevation: 4,
          }}
        />
      );
    }
  }

  return <>{elements}</>;
});

export default HandPoseOverlay;
