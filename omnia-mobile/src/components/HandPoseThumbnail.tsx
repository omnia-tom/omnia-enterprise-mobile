/**
 * Renders a hand pose skeleton as a thumbnail from stored handPoseSample data.
 * Used in SubmissionDetailScreen when stillImageUri is not available.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import type { StepRecap } from '../types';

const HAND_SKELETON: [string, string][] = [
  ['wrist', 'thumbCMC'], ['thumbCMC', 'thumbMP'], ['thumbMP', 'thumbIP'], ['thumbIP', 'thumbTip'],
  ['wrist', 'indexMCP'], ['indexMCP', 'indexPIP'], ['indexPIP', 'indexDIP'], ['indexDIP', 'indexTip'],
  ['wrist', 'middleMCP'], ['middleMCP', 'middlePIP'], ['middlePIP', 'middleDIP'], ['middleDIP', 'middleTip'],
  ['wrist', 'ringMCP'], ['ringMCP', 'ringPIP'], ['ringPIP', 'ringDIP'], ['ringDIP', 'ringTip'],
  ['wrist', 'littleMCP'], ['littleMCP', 'littlePIP'], ['littlePIP', 'littleDIP'], ['littleDIP', 'littleTip'],
  ['indexMCP', 'middleMCP'], ['middleMCP', 'ringMCP'], ['ringMCP', 'littleMCP'],
];

const W = 72;
const H = 72;

export default function HandPoseThumbnail({ handPoseSample }: { handPoseSample: StepRecap['handPoseSample'] }) {
  if (!handPoseSample?.hands?.length) return null;

  const elements: React.ReactElement[] = [];
  const color = '#22c55e';

  for (const hand of handPoseSample.hands) {
    const jointMap = new Map<string, { x: number; y: number }>();
    for (const j of hand.joints) {
      jointMap.set(j.name, { x: j.x, y: j.y });
    }
    for (const [from, to] of HAND_SKELETON) {
      const a = jointMap.get(from);
      const b = jointMap.get(to);
      if (!a || !b) continue;
      const x1 = a.x * W, y1 = (1 - a.y) * H;
      const x2 = b.x * W, y2 = (1 - b.y) * H;
      const dx = x2 - x1, dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      elements.push(
        <View
          key={`${from}-${to}`}
          style={[
            styles.bone,
            {
              left: x1,
              top: y1,
              width: len,
              transform: [{ rotate: `${angle}deg` }],
              backgroundColor: color,
            },
          ]}
        />
      );
    }
  }

  return (
    <View style={styles.container}>
      {elements}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: W, height: H, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 8, overflow: 'hidden' },
  bone: {
    position: 'absolute',
    height: 3,
    opacity: 0.9,
    transformOrigin: 'left center',
  },
});
