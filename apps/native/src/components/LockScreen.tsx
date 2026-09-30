import React from 'react';
import { StyleSheet, View } from 'react-native';
import { session } from '../lib/store';
import { unlockWithBiometrics } from '../lib/native';
import { gradients } from '../lib/theme';
import { Button, Gradient, Text } from './ui';

export function LockScreen() {
  return (
    <Gradient colors={gradients.sunsetVertical} vertical style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', gap: 16, zIndex: 1000 }]}>
      <Text style={{ fontSize: 64, lineHeight: 76 }}>🔒</Text>
      <Text variant="headlineLg" color="#fff">ChatLOL is locked</Text>
      <View style={{ width: 240 }}>
        <Button title="Unlock" icon="fingerprint" variant="white" onPress={async () => { if (await unlockWithBiometrics()) session.set({ locked: false }); }} />
      </View>
    </Gradient>
  );
}
