import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { useFont } from '@shopify/react-native-skia';
import { Bar, CartesianChart } from 'victory-native';
import { Colors, Spacing, Radius } from '../constants/Colors';

type ChartDatum = {
  label: string;
  value: number;
  frontColor?: string;
  gradientColor?: string;
  showGradient?: boolean;
};

type Props = {
  data: ChartDatum[];
  width?: number;
  height?: number;
  maxValueFallback?: number;
  barWidth?: number;
  spacing?: number;
  labelWidth?: number;
  showValuesAsTopLabel?: boolean;
};

export default function StandardBarChart({
  data,
  width = Dimensions.get('window').width - 64,
  height = 200,
  maxValueFallback = 100,
  barWidth = 22,
  spacing = 24,
  labelWidth = 40,
}: Props) {
  const font = useFont(require('../assets/fonts/SpaceMono-Regular.ttf'), 10);
  const safeData = data.length > 0 ? data : [{ label: '', value: 0 }];
  const maxValue = Math.max(...safeData.map((d) => d.value), maxValueFallback);

  // Follow victory-native-xl reference pattern: domainPadding controls gaps.
  const domainPadding = Math.max(18, Math.round(spacing * 1.5));
  const innerPadding = 0.33;

  const chartData = safeData.map((d) => ({
    label: d.label,
    value: d.value,
    color: d.frontColor ?? Colors.primary,
  }));

  return (
    <View style={styles.wrap}>
      <View style={{ width, height }}>
        <CartesianChart
          data={chartData}
          xKey="label"
          yKeys={['value']}
          padding={5}
          domainPadding={{ left: domainPadding, right: domainPadding, top: 18 }}
          domain={{ y: [0, maxValue] }}
          axisOptions={{
            font,
            tickCount: 5,
            lineColor: Colors.border,
            labelColor: Colors.textSecondary,
            formatXLabel: (label) => String(label),
            formatYLabel: (v) => `${Math.round(Number(v))}`,
            labelOffset: { x: Math.round(labelWidth / 4), y: 8 },
          }}
        >
          {({ points, chartBounds }) => {
            return points.value.map((p, i) => {
              return (
                <Bar
                  key={i}
                  points={[p]}
                  chartBounds={chartBounds}
                  color={chartData[i]?.color ?? Colors.primary}
                  barWidth={barWidth}
                  barCount={points.value.length}
                  innerPadding={innerPadding}
                  roundedCorners={{ topLeft: Radius.sm, topRight: Radius.sm }}
                  animate={{ type: 'spring' }}
                />
              );
            });
          }}
        </CartesianChart>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  axisLabel: {
    color: Colors.textSecondary,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  topLabelText: {
    color: Colors.textSecondary,
    fontSize: 9,
    fontWeight: '900',
  },
});
