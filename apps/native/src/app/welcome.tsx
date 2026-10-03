import React from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors, shadow } from '../lib/theme';
import { Button, Row, Text } from '../components/ui';
import { BrandMark } from '../components/chrome';

const COLLAGE = [47, 12, 32, 59];
export default function Welcome() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const w = Math.min(width - 32, 440);
  return (
    <ScrollView style={{ backgroundColor: c.surface }} contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24, paddingHorizontal: 20, alignItems: 'center' }}>
      <View style={{ width: w, alignItems: 'flex-start' }}><BrandMark height={30} /></View>
      <View style={{ width: w, height: w * 0.9, marginTop: 16 }}>
        {COLLAGE.map((img, i) => (
          <View key={img} style={[{ position: 'absolute', backgroundColor: '#fff', padding: 6, paddingBottom: 22, width: w * 0.46,
            left: i % 2 ? w * 0.5 : w * 0.02, top: i < 2 ? (i ? 0 : 20) : w * 0.44, transform: [{ rotate: `${[-6, 5, 3, -4][i]}deg` }] }, shadow.float]}>
            <Image source={`https://i.pravatar.cc/400?img=${img}`} style={{ width: '100%', aspectRatio: 1 }} />
          </View>
        ))}
        <Image source={require('../../assets/brand/mascot.png')} style={{ position: 'absolute', left: -10, bottom: -14, width: w * 0.34, height: w * 0.34 * (493 / 512), zIndex: 2 }} contentFit="contain" />
        <View style={{ position: 'absolute', right: -4, top: w * 0.32, backgroundColor: c.coral, borderRadius: 99, paddingHorizontal: 14, paddingVertical: 8, transform: [{ rotate: '12deg' }] }}>
          <Text variant="labelLg" color="#fff">👑 GOD TIER</Text>
        </View>
      </View>
      <View style={{ width: w, gap: 12, marginTop: 20 }}>
        <Text style={{ fontSize: 52, lineHeight: 54, fontFamily: 'PlusJakartaSans_800ExtraBold', letterSpacing: -2 }}>
          WHERE{'\n'}FRIENDS{'\n'}<Text style={{ fontSize: 52, lineHeight: 54, fontFamily: 'PlusJakartaSans_800ExtraBold', letterSpacing: -2 }} color={c.flame}>MEET.</Text>
        </Text>
        <Text variant="bodyLg" color={c.onSurfaceVariant}>Rate vibes, drop daily photos, hang out in live lounges and make actual friends. 18+.</Text>
        <Button title="Get started — it’s free" icon="arrow-forward" onPress={() => router.push('/join')} style={{ marginTop: 8 }} />
        <Button title="I already have an account" variant="secondary" onPress={() => router.push('/login')} />
        <Row style={{ justifyContent: 'center', marginTop: 4 }}><Text variant="bodySm" color={c.onSurfaceVariant}>🛡️ LOLShield moderation • ✦ AI personas are always labeled</Text></Row>
      </View>
    </ScrollView>
  );
}
