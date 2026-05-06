import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useFont, matchFont } from '@shopify/react-native-skia';
import { Pie, PolarChart } from 'victory-native';
import { Colors } from '../constants/Colors';
import { useTheme } from '../context/ThemeContext';

type DonutDatum = {
  value: number;
  color: string;
  gradientCenterColor?: string;
  text?: string;
};

type Props = {
  data: DonutDatum[];
  radius?: number;
  innerRadius?: number;
  showText?: boolean;
  centerLabelComponent?: () => React.ReactNode;
  style?: StyleProp<ViewStyle>;
  innerCircleColor?: string;
};

export default function StandardDonutChart({
  data,
  radius = 84,
  innerRadius = 58,
  showText = false,
  centerLabelComponent,
  style,
  innerCircleColor,
}: Props) {
  const { theme } = useTheme();
  const resolvedInnerCircleColor = innerCircleColor ?? theme.white;

  const font = matchFont({
    fontSize: 12,
    fontWeight: 'bold',
  });

  const safeData = data.length > 0 ? data : [{ value: 1, color: theme.border, text: '' }];
  const totalValue = safeData.reduce((sum, d) => sum + (Number(d.value) > 0 ? Number(d.value) : 0), 0);
  const hasPositiveValues = totalValue > 0;
  const dataForChart: DonutDatum[] = hasPositiveValues
    ? safeData
    : [{ value: 1, color: theme.border, text: '' }];
  const size = radius * 2;

  const chartData = dataForChart.map((d) => {
    const percentage = Math.round((d.value / totalValue) * 100);
    return {
      value: d.value,
      label: `${percentage}%`,
      color: d.color,
    };
  });

  return (
    <View style={[styles.wrap, style, { width: size, height: size }]}>
      <PolarChart
        data={chartData}
        colorKey="color"
        labelKey="label"
        valueKey="value"
        containerStyle={{ width: size, height: size }}
        canvasStyle={{ width: size, height: size }}
      >
        <Pie.Chart innerRadius={innerRadius} size={size}>
          {() => (
            <>
              <Pie.Slice animate={{ type: 'timing', duration: 900 }} opacity={1}>
                {showText && hasPositiveValues ? (
                  <Pie.Label font={font} color={theme.white} />
                ) : null}
              </Pie.Slice>
              <Pie.SliceAngularInset
                angularInset={{
                  angularStrokeWidth: 3,
                  angularStrokeColor: resolvedInnerCircleColor,
                }}
              />
            </>
          )}
        </Pie.Chart>
      </PolarChart>

      <View
        style={[
          styles.centerOverlay,
          {
            backgroundColor: resolvedInnerCircleColor,
            borderRadius: innerRadius,
            width: innerRadius * 2,
            height: innerRadius * 2,
          },
        ]}
      >
        {centerLabelComponent ? centerLabelComponent() : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: '-50%' }, { translateY: '-50%' }],
    alignItems: 'center',
    justifyContent: 'center',
  },
});
