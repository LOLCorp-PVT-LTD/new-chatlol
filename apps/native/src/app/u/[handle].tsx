import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ScreenHeader } from '../../components/chrome';
import { ProfileView } from '../../components/Profile';

export default function UserScreen() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  return <View style={{ flex: 1 }}><ScreenHeader title={`@${handle}`} /><ProfileView handle={handle} /></View>;
}
