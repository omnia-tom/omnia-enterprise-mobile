import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { colors } from '../theme';

const { width, height } = Dimensions.get('window');

type MeshVariant = 'warm' | 'cool' | 'balanced';

interface MeshBackgroundProps {
  variant?: MeshVariant;
}

const BLOBS: Record<MeshVariant, Array<{
  color: string;
  size: number;
  top: number;
  left: number;
  opacity: number;
}>> = {
  warm: [
    { color: '#F5C6A0', size: width * 0.85, top: -height * 0.08, left: -width * 0.2, opacity: 0.35 },
    { color: '#C5B4E3', size: width * 0.7, top: height * 0.25, left: width * 0.45, opacity: 0.25 },
    { color: '#A8D4F0', size: width * 0.65, top: height * 0.55, left: -width * 0.15, opacity: 0.2 },
    { color: '#F0D6C0', size: width * 0.5, top: height * 0.7, left: width * 0.5, opacity: 0.2 },
  ],
  cool: [
    { color: '#C5B4E3', size: width * 0.8, top: -height * 0.05, left: -width * 0.15, opacity: 0.3 },
    { color: '#A8D4F0', size: width * 0.75, top: height * 0.2, left: width * 0.4, opacity: 0.25 },
    { color: '#F5C6A0', size: width * 0.55, top: height * 0.55, left: -width * 0.1, opacity: 0.2 },
    { color: '#D0C4F0', size: width * 0.5, top: height * 0.7, left: width * 0.45, opacity: 0.18 },
  ],
  balanced: [
    { color: '#F5C6A0', size: width * 0.7, top: -height * 0.05, left: -width * 0.15, opacity: 0.28 },
    { color: '#A8D4F0', size: width * 0.7, top: height * 0.15, left: width * 0.4, opacity: 0.25 },
    { color: '#C5B4E3', size: width * 0.6, top: height * 0.5, left: -width * 0.1, opacity: 0.22 },
    { color: '#F0D6C0', size: width * 0.5, top: height * 0.65, left: width * 0.5, opacity: 0.2 },
  ],
};

export default function MeshBackground({ variant = 'warm' }: MeshBackgroundProps) {
  const blobs = BLOBS[variant];

  return (
    <View style={styles.container} pointerEvents="none">
      {blobs.map((blob, i) => (
        <View
          key={i}
          style={[
            styles.blob,
            {
              backgroundColor: blob.color,
              width: blob.size,
              height: blob.size,
              borderRadius: blob.size / 2,
              top: blob.top,
              left: blob.left,
              opacity: blob.opacity,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  blob: {
    position: 'absolute',
  },
});
