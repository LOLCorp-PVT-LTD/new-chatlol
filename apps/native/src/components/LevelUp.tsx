import React from 'react';
import { Modal, View } from 'react-native';
import { router } from 'expo-router';
import { levelTitle } from '@chatlol/shared';
import { session, useSession } from '../lib/store';
import { useColors, gradients, shadow } from '../lib/theme';
import { Button, Gradient, Label, Text } from './ui';

export function LevelUpModal() {
  const lv = useSession((s) => s.levelUp);
  const c = useColors();
  const close = () => session.set({ levelUp: null });
  return (
    <Modal visible={!!lv} transparent animationType="fade" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: 'rgba(59,46,37,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <View style={{ backgroundColor: c.surfaceContainerLowest, borderRadius: 32, padding: 28, width: '100%', maxWidth: 380, alignItems: 'center', gap: 8 }}>
          <Gradient colors={gradients.sunset} style={[{ width: 108, height: 108, borderRadius: 54, alignItems: 'center', justifyContent: 'center' }, shadow.float]}>
            <Text variant="headlineXl" color="#fff">{lv?.to}</Text>
          </Gradient>
          <Label>Level up!</Label>
          <Text variant="headlineLg" style={{ textAlign: 'center' }}>You’re a {lv ? levelTitle(lv.to) : ''}</Text>
          <Text color={c.onSurfaceVariant} style={{ textAlign: 'center' }}>+{(lv?.to ?? 0) * 10} bonus Sparks landed in your wallet.</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, alignSelf: 'stretch' }}>
            <Button title="Open Vault" variant="secondary" style={{ flex: 1 }} onPress={() => { close(); router.push('/vault'); }} />
            <Button title="Keep vibing" style={{ flex: 1 }} onPress={close} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
