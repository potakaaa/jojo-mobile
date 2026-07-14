import type { OrderStatus } from '@jojopotato/types';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Colors, FontFamily, Palette, Radii, Spacing, TypeScale, type ThemeMode } from '../theme';

export interface OrderStatusTimelineProps {
  currentStatus: OrderStatus;
  mode?: ThemeMode;
  style?: ViewStyle;
  liveMode?: boolean;
}

const STATUS_SEQUENCE: OrderStatus[] = [
  'pending',
  'accepted',
  'preparing',
  'flavoring',
  'ready',
  'completed',
];

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Order received',
  accepted: 'Confirmed by branch',
  preparing: 'Frying now',
  flavoring: 'Shaking the flavor',
  ready: 'Ready for pickup',
  completed: 'Picked up',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
};

const DOT_SIZE = 14;
const CONNECTOR_H = 22;

// Pulsing dot for the active step — scale breathes in live mode.
function StepDot({
  isActive,
  isCurrent,
  live,
  mode,
}: {
  isActive: boolean;
  isCurrent: boolean;
  live: boolean;
  mode: ThemeMode;
}) {
  const theme = Colors[mode];
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isCurrent || !live) {
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20 }).start();
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.45, duration: 650, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 650, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [isCurrent, live, scale]);

  return (
    <Animated.View
      style={[
        styles.dot,
        {
          backgroundColor: isActive ? Palette.green : theme.backgroundSelected,
          borderColor: isActive ? Palette.greenDark : theme.border,
          transform: [{ scale }],
        },
      ]}
    />
  );
}

// Connector line between two steps.
// isCompleted  — both endpoints are done (solid green).
// isCurrent    — top endpoint done, bottom not yet (animated scan line).
function StepConnector({
  isCompleted,
  isCurrent,
  live,
}: {
  isCompleted: boolean;
  isCurrent: boolean;
  live: boolean;
}) {
  const scanY = useRef(new Animated.Value(0)).current;
  const scanOp = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isCurrent || !live) {
      scanOp.setValue(0);
      scanY.setValue(0);
      return;
    }
    scanOp.setValue(1);
    // Scan a bright sliver from top to bottom, then repeat.
    const anim = Animated.loop(
      Animated.timing(scanY, {
        toValue: 1,
        duration: 750,
        useNativeDriver: true,
      }),
    );
    anim.start();
    return () => {
      anim.stop();
      scanOp.setValue(0);
    };
  }, [isCurrent, live, scanOp, scanY]);

  const translateY = scanY.interpolate({
    inputRange: [0, 1],
    outputRange: [-CONNECTOR_H, CONNECTOR_H],
  });

  return (
    <View style={styles.connectorWrap}>
      {/* Base track */}
      <View
        style={[
          styles.connectorTrack,
          {
            backgroundColor: isCompleted || isCurrent ? Palette.green : Palette.neutral100,
            opacity: isCompleted ? 1 : isCurrent ? 0.45 : 0.3,
          },
        ]}
      />
      {/* Moving scan sliver */}
      <Animated.View
        style={[styles.scanSliver, { transform: [{ translateY }], opacity: scanOp }]}
      />
    </View>
  );
}

export function OrderStatusTimeline({
  currentStatus,
  mode = 'light',
  style,
  liveMode = false,
}: OrderStatusTimelineProps) {
  const theme = Colors[mode];

  if (currentStatus === 'cancelled' || currentStatus === 'rejected') {
    return (
      <View style={[styles.wrap, style]}>
        <View style={styles.step}>
          <View
            style={[styles.dot, { backgroundColor: Palette.jred, borderColor: Palette.jred }]}
          />
          <Text style={[styles.label, { color: theme.text }]}>{STATUS_LABEL[currentStatus]}</Text>
        </View>
      </View>
    );
  }

  const currentIndex = STATUS_SEQUENCE.indexOf(currentStatus);

  return (
    <View style={[styles.wrap, style]}>
      {STATUS_SEQUENCE.map((status, index) => {
        const isActive = index <= currentIndex;
        const isCurrent = index === currentIndex;
        const isLast = index === STATUS_SEQUENCE.length - 1;

        return (
          <View key={status}>
            <View style={styles.step}>
              <StepDot isActive={isActive} isCurrent={isCurrent} live={liveMode} mode={mode} />
              <Text style={[styles.label, { color: isActive ? theme.text : theme.textSecondary }]}>
                {STATUS_LABEL[status]}
              </Text>
            </View>
            {!isLast && (
              <StepConnector
                isCompleted={index < currentIndex}
                isCurrent={isCurrent}
                live={liveMode}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    // gap removed — connector lines fill the vertical space between steps
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: Radii.full,
    borderWidth: 2,
  },
  // Centered under the dot: marginLeft = (DOT_SIZE - lineWidth) / 2 = 6
  connectorWrap: {
    marginLeft: 6,
    marginVertical: 3,
    width: 2,
    height: CONNECTOR_H,
    overflow: 'hidden',
  },
  connectorTrack: {
    position: 'absolute',
    width: 2,
    height: CONNECTOR_H,
  },
  // Bright sliver that travels from top to bottom of the connector.
  scanSliver: {
    position: 'absolute',
    left: -1,
    width: 4,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  label: {
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.bodySmall,
    flex: 1,
  },
});
