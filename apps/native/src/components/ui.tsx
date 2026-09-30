import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Pressable, StyleSheet, Text as RNText, TextInput, View,
  type PressableProps, type StyleProp, type TextInputProps, type TextProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { typography, countdown } from '@chatlol/shared';
import { fonts, gradients, shadow, useColors } from '../lib/theme';
import { haptic } from '../lib/native';

type Variant = keyof typeof typography;
const weightFont = (w: string) => (w === '800' ? fonts.extra : w === '700' ? fonts.bold : fonts.medium);

export function Text({ variant = 'bodyMd', color, style, ...rest }: TextProps & { variant?: Variant; color?: string }) {
  const c = useColors();
  const t = typography[variant];
  return (
    <RNText
      {...rest}
      style={[{ fontSize: t.fontSize, lineHeight: t.lineHeight, letterSpacing: t.letterSpacing, fontFamily: weightFont(t.fontWeight), color: color ?? c.onSurface }, style]}
    />
  );
}

export type IconName = React.ComponentProps<typeof MaterialIcons>['name'];
export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color?: string }) {
  const c = useColors();
  return <MaterialIcons name={name} size={size} color={color ?? c.onSurfaceVariant} />;
}

export function Button({
  title, icon, onPress, variant = 'primary', disabled, loading, style, small,
}: { title?: string; icon?: IconName; onPress?: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'white'; disabled?: boolean; loading?: boolean; style?: StyleProp<ViewStyle>; small?: boolean }) {
  const c = useColors();
  const h = small ? 38 : 50;
  const fg = variant === 'primary' || variant === 'danger' ? '#fff' : variant === 'secondary' || variant === 'white' ? c.flame : c.onSurface;
  const inner = (
    <View style={[styles.btnInner, { height: h, paddingHorizontal: small ? 14 : 22 }]}>
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={small ? 18 : 20} color={fg} /> : null}
      {title ? <Text variant={small ? 'labelMd' : 'labelLg'} color={fg}>{title}</Text> : null}
    </View>
  );
  return (
    <Pressable
      disabled={disabled || loading}
      onPress={() => { haptic.tap(); onPress?.(); }}
      style={({ pressed }) => [
        { borderRadius: 999, opacity: disabled ? 0.5 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] },
        variant === 'primary' && shadow.float,
        variant === 'secondary' && { backgroundColor: c.sunlit },
        variant === 'white' && { backgroundColor: '#fff' },
        variant === 'danger' && { backgroundColor: c.error },
        style,
      ]}
    >
      {variant === 'primary' ? (
        <LinearGradient colors={gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 999 }}>{inner}</LinearGradient>
      ) : inner}
    </Pressable>
  );
}

export function IconButton({ name, onPress, color, bg, size = 44, badge, label }: { name: IconName; onPress?: () => void; color?: string; bg?: string; size?: number; badge?: number; label: string }) {
  return (
    <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={() => { haptic.tap(); onPress?.(); }}
      style={({ pressed }) => ({ width: size, height: size, borderRadius: size, alignItems: 'center', justifyContent: 'center', backgroundColor: bg, transform: [{ scale: pressed ? 0.92 : 1 }] })}>
      <Icon name={name} color={color} size={size * 0.5} />
      {badge ? <View style={styles.badge}><Text variant="labelSm" color="#fff" style={{ fontSize: 10 }}>{badge > 99 ? '99+' : badge}</Text></View> : null}
    </Pressable>
  );
}

export function Card({ style, children }: { style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const c = useColors();
  return <View style={[{ backgroundColor: c.surfaceContainerLowest, borderRadius: 32 }, shadow.warm, style]}>{children}</View>;
}

export function Chip({ label, active, onPress, icon }: { label: string; active?: boolean; onPress?: () => void; icon?: IconName }) {
  const c = useColors();
  return (
    <Pressable onPress={() => { haptic.tap(); onPress?.(); }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1,
        borderColor: active ? c.umber : c.sandstone, backgroundColor: active ? c.umber : c.surfaceContainerLowest }}>
      {icon ? <Icon name={icon} size={16} color={active ? c.cream : c.onSurfaceVariant} /> : null}
      <Text variant="labelMd" color={active ? c.cream : c.onSurface}>{label}</Text>
    </Pressable>
  );
}

export function Input(props: TextInputProps & { style?: StyleProp<TextStyle> }) {
  const c = useColors();
  const [focus, setFocus] = useState(false);
  return (
    <TextInput
      placeholderTextColor={c.outline}
      {...props}
      onFocus={(e) => { setFocus(true); props.onFocus?.(e); }}
      onBlur={(e) => { setFocus(false); props.onBlur?.(e); }}
      style={[{
        minHeight: 52, borderRadius: props.multiline ? 24 : 999, paddingHorizontal: 22, paddingVertical: props.multiline ? 14 : 0,
        backgroundColor: c.surfaceContainerLowest, borderWidth: focus ? 2 : 1, borderColor: focus ? c.flame : c.sandstone,
        color: c.onSurface, fontFamily: fonts.medium, fontSize: 16, textAlignVertical: props.multiline ? 'top' : 'center',
      }, props.style]}
    />
  );
}

export function Progress({ value, max = 100, light, height = 10 }: { value: number; max?: number; light?: boolean; height?: number }) {
  const c = useColors();
  return (
    <View style={{ height, borderRadius: 99, overflow: 'hidden', backgroundColor: light ? 'rgba(255,255,255,0.25)' : c.surfaceContainer }}>
      <LinearGradient colors={light ? ['#fef08a', '#ffffff'] : [c.secondaryContainer, c.primaryContainer]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={{ height: '100%', width: `${Math.min(100, (value / max) * 100)}%`, borderRadius: 99 }} />
    </View>
  );
}

export function Countdown({ to, color, variant = 'labelMd' }: { to: string; color?: string; variant?: Variant }) {
  const [t, setT] = useState(countdown(to));
  useEffect(() => { const i = setInterval(() => setT(countdown(to)), 1000); return () => clearInterval(i); }, [to]);
  return <Text variant={variant} color={color} style={{ fontVariant: ['tabular-nums'] }}>{t}</Text>;
}

export function Empty({ emoji = '🌅', title, body, children }: { emoji?: string; title: string; body?: string; children?: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24, gap: 6 }}>
      <RNText style={{ fontSize: 48 }}>{emoji}</RNText>
      <Text variant="headlineSm" style={{ textAlign: 'center' }}>{title}</Text>
      {body ? <Text color={c.onSurfaceVariant} style={{ textAlign: 'center', maxWidth: 280 }}>{body}</Text> : null}
      {children ? <View style={{ marginTop: 10 }}>{children}</View> : null}
    </View>
  );
}

export function Label({ children, color }: { children: React.ReactNode; color?: string }) {
  const c = useColors();
  return <Text variant="labelSm" color={color ?? c.onSurfaceVariant} style={{ textTransform: 'uppercase' }}>{children}</Text>;
}

export function Gradient({ style, children, colors = gradients.sunset, vertical }: { style?: StyleProp<ViewStyle>; children?: React.ReactNode; colors?: readonly [string, string, ...string[]]; vertical?: boolean }) {
  return <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={vertical ? { x: 0, y: 1 } : { x: 1, y: 1 }} style={style}>{children}</LinearGradient>;
}

export function Row({ style, children, gap = 8 }: { style?: StyleProp<ViewStyle>; children: React.ReactNode; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Tap(props: PressableProps & { style?: StyleProp<ViewStyle> }) {
  return <Pressable {...props} style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }, props.style]} />;
}

const styles = StyleSheet.create({
  btnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  badge: { position: 'absolute', top: 4, right: 2, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: '#ff3366', alignItems: 'center', justifyContent: 'center' },
});
