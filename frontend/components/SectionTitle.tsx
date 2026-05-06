import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle, StyleProp } from 'react-native';
import { Spacing, Colors } from '../constants/Colors';
import { useTheme } from '../context/ThemeContext';

type Props = {
  title: string;
  right?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export default function SectionTitle({ title, right, containerStyle, textStyle }: Props) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);

  return (
    <View style={[styles.container, containerStyle]}>
      <Text style={[styles.title, textStyle]}>{title}</Text>
      {right ? <View>{right}</View> : null}
    </View>
  );
}

function makeStyles(theme: typeof Colors) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Spacing.md,
    },
    title: {
      fontSize: 18,
      fontWeight: '900',
      color: theme.text,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
  });
}
