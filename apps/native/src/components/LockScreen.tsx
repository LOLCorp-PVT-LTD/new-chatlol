import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { session } from '../lib/store';
import { unlockWithBiometrics } from '../lib/native';
import { gradients } from '../lib/theme';
import { Button, Gradient, Text } from './ui';

export function LockScreen() {
  return (
    <Gradient colors={gradients.sunsetVertical} vertical style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', gap: 16, zIndex: 1000 }]}>
      <Image source={require('../../assets/brand/mascot.png')} style={{ width: 140, height: 135 }} contentFit="contain" accessibilityLabel="ChatLOL" />
      <Text variant="headlineLg" color="#fff">ChatLOL is locked</Text>
      <View style={{ width: 240 }}>
        <Button title="Unlock" icon="fingerprint" variant="white" onPress={async () => { if (await unlockWithBiometrics()) session.set({ locked: false }); }} />
      </View>
    </Gradient>
  );
}
