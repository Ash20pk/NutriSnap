import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StyleProp, ViewStyle, TextStyle, Image } from 'react-native';
import { Colors, Spacing } from '../constants/Colors';

type Avatar = {
  text: string;
  uri?: string;
  dicebearSeed?: string;
  useDicebear?: boolean;
  size?: number;
  textStyle?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
};

type Props = {
  title: string;
  subtitle?: string;
  avatar?: Avatar;
  left?: React.ReactNode;
  right?: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  subtitleStyle?: StyleProp<TextStyle>;
};

export default function UserRow({
  title,
  subtitle,
  avatar,
  left,
  right,
  onPress,
  disabled,
  style,
  titleStyle,
  subtitleStyle,
}: Props) {
  const [avatarImageFailed, setAvatarImageFailed] = React.useState(false);

  const dicebearUrl = React.useMemo(() => {
    if (!avatar) return null;
    const seed = encodeURIComponent((avatar.dicebearSeed || avatar.text || title).trim());
    // PNG works well with React Native Image.
    return `https://api.dicebear.com/7.x/bottts/png?seed=${seed}`;
  }, [avatar, title]);

  const content = (
    <View style={[styles.container, style]}>
      {left ? <View style={styles.left}>{left}</View> : null}

      {avatar ? (
        <View
          style={[
            styles.avatar,
            { width: avatar.size ?? 40, height: avatar.size ?? 40, borderRadius: (avatar.size ?? 40) / 2 },
            avatar.containerStyle,
          ]}
        >
          {!avatarImageFailed && (avatar.uri || avatar.useDicebear !== false) ? (
            <Image
              source={{ uri: avatar.uri || (dicebearUrl as string) }}
              style={{ width: '100%', height: '100%', borderRadius: (avatar.size ?? 40) / 2 }}
              onError={() => setAvatarImageFailed(true)}
            />
          ) : (
            <Text style={[styles.avatarText, avatar.textStyle]} numberOfLines={1}>
              {avatar.text}
            </Text>
          )}
        </View>
      ) : null}

      <View style={styles.main}>
        <Text style={[styles.title, titleStyle]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, subtitleStyle]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );

  if (!onPress) return content;

  return (
    <TouchableOpacity activeOpacity={0.85} disabled={disabled} onPress={onPress}>
      {content}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
  },
  left: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.backgroundSecondary,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '900',
    color: Colors.text,
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 15,
    fontWeight: '900',
    color: Colors.text,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textSecondary,
  },
  right: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
